<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 700px;">
	<div>
		<div class="_gaps_m">
			<MkInput v-model="name">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>
			<MkSelect v-model="src" :items="antennaSourcesSelectDef">
				<template #label>{{ i18n.ts.antennaSource }}</template>
			</MkSelect>
			<MkSelect v-if="src === 'list'" v-model="userListId" :items="userListsSelectDef">
				<template #label>{{ i18n.ts.userList }}</template>
			</MkSelect>
			<MkTextarea v-else-if="src === 'users' || src === 'users_blacklist'" v-model="users">
				<template #label>{{ i18n.ts.users }}</template>
				<template #caption>{{ i18n.ts.antennaUsersDescription }} <button class="_textButton" @click="addUser">{{ i18n.ts.addUser }}</button></template>
			</MkTextarea>
			<MkSwitch v-model="excludeBots">{{ i18n.ts.antennaExcludeBots }}</MkSwitch>
			<MkSwitch v-model="withReplies">{{ i18n.ts.withReplies }}</MkSwitch>
			<MkSwitch v-model="isScoringMode">{{ i18n.ts._tempuraFutureAntenna.scoringMode }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>
			<div :class="$style.field">
				<div :class="$style.label">{{ i18n.ts.antennaKeywords }}</div>
				<MkKeywordGroupsInput v-model="keywords"/>
				<div :class="$style.caption">{{ i18n.ts._tempuraFutureAntenna.keywordGroupsDescription }}</div>
			</div>
			<div :class="$style.field">
				<div :class="$style.label">{{ i18n.ts.antennaExcludeKeywords }}</div>
				<MkKeywordGroupsInput v-model="excludeKeywords"/>
				<div :class="$style.caption">{{ isScoringMode ? i18n.ts._tempuraFutureAntenna.scoringModeDescription : i18n.ts._tempuraFutureAntenna.keywordGroupsDescription }}</div>
			</div>
			<div v-if="isScoringMode" :class="$style.field">
				<div :class="$style.label">{{ i18n.ts._tempuraFutureAntenna.mustExcludeKeywords }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></div>
				<MkKeywordGroupsInput v-model="mustExcludeKeywords"/>
				<div :class="$style.caption">{{ i18n.ts._tempuraFutureAntenna.mustExcludeKeywordsDescription }}</div>
			</div>
			<MkSwitch v-model="localOnly">{{ i18n.ts.localOnly }}</MkSwitch>
			<MkSwitch v-model="caseSensitive">{{ i18n.ts.caseSensitive }}</MkSwitch>
			<MkSwitch v-model="withFile">{{ i18n.ts.withFileAntenna }}</MkSwitch>
			<MkSwitch v-model="excludeNotesInSensitiveChannel">{{ i18n.ts.excludeNotesInSensitiveChannel }}</MkSwitch>
			<MkSwitch v-model="onlyFollowers">{{ i18n.ts.onlyFollowers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>
			<div :class="$style.tryConditions">
				<MkButton inline :disabled="tryRunning" @click="tryConditions()"><i class="ti ti-antenna"></i> {{ i18n.ts._tempuraFutureAntenna.tryConditions }}</MkButton>
				<div :class="$style.caption">{{ i18n.ts._tempuraFutureAntenna.tryConditionsDescription }}</div>
				<MkLoading v-if="tryRunning" :inline="true"/>
				<div v-else-if="tryResults != null" :class="$style.tryResults">
					<div :class="$style.label">{{ i18n.ts._tempuraFutureAntenna.tryConditionsResult }}</div>
					<MkResult v-if="tryResults.length === 0" type="empty" :text="i18n.ts._tempuraFutureAntenna.tryConditionsNoMatch"/>
					<template v-else>
						<MkNote v-for="note in tryResults" :key="note.id" :class="$style.tryNote" :note="note"/>
					</template>
				</div>
			</div>
		</div>
		<div :class="$style.actions">
			<div class="_buttons">
				<MkButton inline primary @click="saveAntenna()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
				<MkButton v-if="initialAntenna.id != null" inline @click="resetAntenna()"><i class="ti ti-restore"></i> {{ i18n.ts.reset }}</MkButton>
				<MkButton v-if="initialAntenna.id != null" inline danger @click="deleteAntenna()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { watch, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { DeepPartial } from '@/utility/merge.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkNote from '@/components/MkNote.vue';
import MkKeywordGroupsInput from '@/components/MkKeywordGroupsInput.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { deepMerge } from '@/utility/merge.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

type PartialAllowedAntenna = Omit<Misskey.entities.Antenna, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'> & {
	id?: string;
	createdAt?: string;
	updatedAt?: string;
	lastUsedAt?: string;
};

const props = defineProps<{
	antenna?: DeepPartial<PartialAllowedAntenna>;
}>();

const initialAntenna = deepMerge<PartialAllowedAntenna>(props.antenna ?? {}, {
	name: '',
	src: 'all',
	userListId: null,
	users: [],
	keywords: [],
	excludeKeywords: [],
	mustExcludeKeywords: [],
	excludeBots: false,
	withReplies: false,
	caseSensitive: false,
	localOnly: false,
	withFile: false,
	excludeNotesInSensitiveChannel: false,
	isActive: true,
	hasUnreadNote: false,
	notify: false,
	onlyFollowers: false,
	expression: null,
});

const emit = defineEmits<{
	(ev: 'created', newAntenna: Misskey.entities.Antenna): void,
	(ev: 'updated', editedAntenna: Misskey.entities.Antenna): void,
	(ev: 'deleted'): void,
}>();

const {
	model: src,
	def: antennaSourcesSelectDef,
} = useMkSelect({
	items: [
		{ value: 'all', label: i18n.ts._antennaSources.all },
		//{ value: 'home', label: i18n.ts._antennaSources.homeTimeline },
		{ value: 'users', label: i18n.ts._antennaSources.users },
		//{ value: 'list', label: i18n.ts._antennaSources.userList },
		{ value: 'users_blacklist', label: i18n.ts._antennaSources.userBlacklist },
	],
	initialValue: initialAntenna.src,
});

const {
	model: userListId,
	def: userListsSelectDef,
} = useMkSelect({
	items: computed(() => {
		if (userLists.value == null) return [];
		return userLists.value.map(list => ({
			value: list.id,
			label: list.name,
		}));
	}),
	initialValue: initialAntenna.userListId,
});

const name = ref<string>(initialAntenna.name);
const users = ref<string>(initialAntenna.users.join('\n'));
const keywords = ref<string[][]>(initialAntenna.keywords.map(x => [...x]));
const excludeKeywords = ref<string[][]>(initialAntenna.excludeKeywords.map(x => [...x]));
const mustExcludeKeywords = ref<string[][]>(initialAntenna.mustExcludeKeywords ? initialAntenna.mustExcludeKeywords.map(x => [...x]) : []);
const caseSensitive = ref<boolean>(initialAntenna.caseSensitive);
const localOnly = ref<boolean>(initialAntenna.localOnly);
const excludeBots = ref<boolean>(initialAntenna.excludeBots);
const withReplies = ref<boolean>(initialAntenna.withReplies);
const withFile = ref<boolean>(initialAntenna.withFile);
const excludeNotesInSensitiveChannel = ref<boolean>(initialAntenna.excludeNotesInSensitiveChannel);
const onlyFollowers = ref<boolean>(initialAntenna.onlyFollowers);
const userLists = ref<Misskey.entities.UserList[] | null>(null);
const isScoringMode = ref<boolean>(initialAntenna.expression === 'SCORE');
const tryResults = ref<Misskey.entities.Note[] | null>(null);
const tryRunning = ref<boolean>(false);

watch(() => src.value, async () => {
	if (src.value === 'list' && userLists.value === null) {
		userLists.value = await misskeyApi('users/lists/list');
	}
});

function buildAntennaData() {
	return {
		name: name.value,
		src: src.value,
		userListId: userListId.value,
		excludeBots: excludeBots.value,
		withReplies: withReplies.value,
		withFile: withFile.value,
		excludeNotesInSensitiveChannel: excludeNotesInSensitiveChannel.value,
		caseSensitive: caseSensitive.value,
		localOnly: localOnly.value,
		users: users.value.trim().split('\n').map(x => x.trim()),
		keywords: keywords.value.map(x => x.filter(k => k !== '')).filter(x => x.length > 0),
		excludeKeywords: excludeKeywords.value.map(x => x.filter(k => k !== '')).filter(x => x.length > 0),
		mustExcludeKeywords: mustExcludeKeywords.value.map(x => x.filter(k => k !== '')).filter(x => x.length > 0),
		onlyFollowers: onlyFollowers.value,
		expression: isScoringMode.value ? 'SCORE' : null,
	};
}

// 最後に保存が成功した値。リセットはページ表示時点ではなくこの値に戻す
let savedAntenna = initialAntenna;

async function saveAntenna() {
	const antennaData = buildAntennaData();

	if (initialAntenna.id == null) {
		const res = await os.apiWithDialog('antennas/create', antennaData);
		emit('created', res);
	} else {
		const res = await os.apiWithDialog('antennas/update', { ...antennaData, antennaId: initialAntenna.id });
		savedAntenna = { ...savedAntenna, ...antennaData };
		emit('updated', res);
	}
}

// 未保存の編集を破棄して、保存済みの値に戻す
async function resetAntenna() {
	if (initialAntenna.id == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (canceled) return;

	name.value = savedAntenna.name;
	src.value = savedAntenna.src;
	userListId.value = savedAntenna.userListId;
	users.value = savedAntenna.users.join('\n');
	keywords.value = savedAntenna.keywords.map(x => [...x]);
	excludeKeywords.value = savedAntenna.excludeKeywords.map(x => [...x]);
	mustExcludeKeywords.value = savedAntenna.mustExcludeKeywords ? savedAntenna.mustExcludeKeywords.map(x => [...x]) : [];
	caseSensitive.value = savedAntenna.caseSensitive;
	localOnly.value = savedAntenna.localOnly;
	excludeBots.value = savedAntenna.excludeBots;
	withReplies.value = savedAntenna.withReplies;
	withFile.value = savedAntenna.withFile;
	excludeNotesInSensitiveChannel.value = savedAntenna.excludeNotesInSensitiveChannel;
	onlyFollowers.value = savedAntenna.onlyFollowers;
	isScoringMode.value = savedAntenna.expression === 'SCORE';
	tryResults.value = null;
}

async function tryConditions() {
	tryRunning.value = true;
	tryResults.value = null;
	try {
		tryResults.value = await misskeyApi('antennas/test', buildAntennaData());
	} catch (err) {
		os.alert({
			type: 'error',
			text: err instanceof Error ? err.message : String(err),
		});
	} finally {
		tryRunning.value = false;
	}
}

async function deleteAntenna() {
	if (initialAntenna.id == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.removeAreYouSure({ x: initialAntenna.name }),
	});
	if (canceled) return;

	await misskeyApi('antennas/delete', {
		antennaId: initialAntenna.id,
	});

	os.success();
	emit('deleted');
}

function addUser() {
	os.selectUser({ includeSelf: true }).then(user => {
		users.value = users.value.trim();
		users.value += '\n@' + Misskey.acct.toString(user);
		users.value = users.value.trim();
	});
}
</script>

<style lang="scss" module>
.actions {
	margin-top: 16px;
	padding: 24px 0;
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.label {
	font-size: 0.85em;
	font-weight: bold;
}

.caption {
	font-size: 0.8em;
	opacity: 0.7;
}

.tryConditions {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
}

.tryResults {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.tryNote {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
