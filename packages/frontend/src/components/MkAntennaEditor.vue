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
			<MkSelect v-model="keywordMode" :items="keywordModeSelectDef">
				<template #label>{{ i18n.ts._tempuraFutureAntenna.keywordMode }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<template #caption>{{ keywordMode === 'regex' ? i18n.ts._tempuraFutureAntenna.regexModeDescription : undefined }}</template>
			</MkSelect>
			<MkInfo v-if="keywordModeWarning != null" warn>{{ keywordModeWarning }}</MkInfo>
			<MkInfo v-if="limitStatus != null" warn>{{ describeKeywordError(limitStatus.violation, true, !limitStatus.blocksSave) }}</MkInfo>
			<div :class="$style.field">
				<div :class="$style.label">{{ i18n.ts.antennaKeywords }}</div>
				<MkKeywordGroupsInput v-model="keywords" :regexMode="keywordMode === 'regex'"/>
				<div :class="$style.caption">{{ i18n.ts._tempuraFutureAntenna.keywordGroupsDescription }}</div>
			</div>
			<div :class="$style.field">
				<div :class="$style.label">{{ i18n.ts.antennaExcludeKeywords }}</div>
				<MkKeywordGroupsInput v-model="excludeKeywords" :regexMode="keywordMode === 'regex'"/>
				<div :class="$style.caption">{{ isScoringMode ? i18n.ts._tempuraFutureAntenna.scoringModeDescription : i18n.ts._tempuraFutureAntenna.keywordGroupsDescription }}</div>
			</div>
			<div v-if="isScoringMode" :class="$style.field">
				<div :class="$style.label">{{ i18n.ts._tempuraFutureAntenna.mustExcludeKeywords }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></div>
				<MkKeywordGroupsInput v-model="mustExcludeKeywords" :regexMode="keywordMode === 'regex'"/>
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
import MkInfo from '@/components/MkInfo.vue';
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
	keywordMode: 'literal',
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

const {
	model: keywordMode,
	def: keywordModeSelectDef,
} = useMkSelect({
	items: [
		{ value: 'literal', label: i18n.ts._tempuraFutureAntenna.keywordModeLiteral },
		{ value: 'regex', label: i18n.ts._tempuraFutureAntenna.keywordModeRegex },
	],
	initialValue: initialAntenna.keywordMode,
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
// 試し打ちの応答が条件変更やリセットと前後しても、古い応答で結果を上書きしないようにする
let trySeq = 0;

// 条件が変わったら試し打ちの結果を無効化する(別の条件で得た結果を表示し続けない)
watch([() => src.value, () => userListId.value, () => keywordMode.value, users, keywords, excludeKeywords, mustExcludeKeywords, caseSensitive, localOnly, excludeBots, withReplies, withFile, excludeNotesInSensitiveChannel, onlyFollowers, isScoringMode], () => {
	trySeq++;
	tryRunning.value = false;
	tryResults.value = null;
}, { deep: true });

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
		keywordMode: keywordMode.value,
	};
}

// 最後に保存が成功した値。リセットはページ表示時点ではなくこの値に戻す。
// 保存後にモード切替の警告を再評価できるよう ref で保持する
const savedAntenna = ref(initialAntenna);

// 保存済みのモードと違うときだけ、切り替え方向に応じた警告を出す
const keywordModeWarning = computed(() => {
	if (keywordMode.value === savedAntenna.value.keywordMode) return null;
	return keywordMode.value === 'regex'
		? i18n.ts._tempuraFutureAntenna.regexModeWarningToRegex
		: i18n.ts._tempuraFutureAntenna.regexModeWarningToLiteral;
});

// backend の antenna-regex.ts と同じ上限。ここを変えるときは両方そろえる
const REGEX_GROUP_LIMIT = 32;
const REGEX_KEYWORDS_PER_GROUP_LIMIT = 32;
const REGEX_PATTERN_MAX_LENGTH = 512;

type KeywordLimitInfo = { reason?: string; pattern?: string; location?: { keywordType?: string; groupIndex?: number; keywordIndex?: number } };

// INVALID_REGEX / KEYWORD_LIMIT_EXCEEDED の info から、どの項目がどう駄目だったかをユーザー向けの文にする
function describeKeywordError(info: unknown, isLimit: boolean, savable = false): string {
	const data = (info ?? {}) as KeywordLimitInfo;
	const reasons: Record<string, string> = isLimit
		? {
			patternTooLong: i18n.tsx._tempuraFutureAntenna.keywordLimitTooLong({ max: REGEX_PATTERN_MAX_LENGTH }),
			tooManyGroups: i18n.tsx._tempuraFutureAntenna.keywordLimitTooManyGroups({ max: REGEX_GROUP_LIMIT }),
			tooManyKeywords: i18n.tsx._tempuraFutureAntenna.keywordLimitTooManyKeywords({ max: REGEX_KEYWORDS_PER_GROUP_LIMIT }),
		}
		: {
			invalidPattern: i18n.ts._tempuraFutureAntenna.invalidRegex,
			patternTooLong: i18n.tsx._tempuraFutureAntenna.invalidRegexTooLong({ max: REGEX_PATTERN_MAX_LENGTH }),
			tooManyGroups: i18n.tsx._tempuraFutureAntenna.invalidRegexTooManyGroups({ max: REGEX_GROUP_LIMIT }),
			tooManyKeywords: i18n.tsx._tempuraFutureAntenna.invalidRegexTooManyKeywords({ max: REGEX_KEYWORDS_PER_GROUP_LIMIT }),
		};
	const fallback = isLimit ? i18n.ts._tempuraFutureAntenna.keywordLimitExceeded : i18n.ts._tempuraFutureAntenna.invalidRegex;
	const lines = [reasons[data.reason ?? ''] ?? fallback];
	if (savable) {
		// 既存の超過分はそのまま保存できるので、保存が止まるわけではないと伝える
		lines.push(i18n.ts._tempuraFutureAntenna.keywordLimitGrandfathered);
	}
	if (data.pattern != null) {
		lines.push(i18n.tsx._tempuraFutureAntenna.invalidRegexPattern({ pattern: data.pattern }));
	}
	const keywordTypeLabels: Record<string, string> = {
		keywords: i18n.ts.antennaKeywords,
		excludeKeywords: i18n.ts.antennaExcludeKeywords,
		mustExcludeKeywords: i18n.ts._tempuraFutureAntenna.mustExcludeKeywords,
	};
	const location = data.location;
	if (location?.keywordType != null) {
		const label = keywordTypeLabels[location.keywordType] ?? location.keywordType;
		if (location.groupIndex != null && location.keywordIndex != null) {
			lines.push(i18n.tsx._tempuraFutureAntenna.keywordErrorPosition({
				keywordType: label,
				group: location.groupIndex + 1,
				index: location.keywordIndex + 1,
			}));
		} else {
			lines.push(label);
		}
	}
	// MkDialog は改行を保持しないので、1行に収まる形で返す
	return lines.join(' / ');
}

// 保存時に送る形にそろえる (空項目を落とし、空グループを除く)
function normalizeKeywordGroups(groups: string[][]): string[][] {
	return groups.map(x => x.filter(k => k !== '')).filter(x => x.length > 0);
}

// キーワード群ごとの上限超過量。バックエンドの measureAntennaKeywordLimitExcess と同じ計算
function measureExcess(groups: string[][]): number {
	let excess = Math.max(0, groups.length - REGEX_GROUP_LIMIT);
	for (const group of groups) {
		excess += Math.max(0, group.length - REGEX_KEYWORDS_PER_GROUP_LIMIT);
		for (const pattern of group) excess += Math.max(0, pattern.length - REGEX_PATTERN_MAX_LENGTH);
	}
	return excess;
}

// 強制除外キーワードは SCORE モードでしか使われないので、そのときだけ対象にする
const keywordFields = computed(() => {
	const fields: { keywordType: string; groups: string[][] }[] = [
		{ keywordType: 'keywords', groups: normalizeKeywordGroups(keywords.value) },
		{ keywordType: 'excludeKeywords', groups: normalizeKeywordGroups(excludeKeywords.value) },
	];
	if (isScoringMode.value) {
		fields.push({ keywordType: 'mustExcludeKeywords', groups: normalizeKeywordGroups(mustExcludeKeywords.value) });
	}
	return fields;
});

// 上限を超えている項目と、保存済みの状態から超過が増えたかどうか。
// 既存アンテナは「超過が増えない限り」保存できる (バックエンドの判定に合わせる) ので、
// 超過が増えたときだけ保存が失敗する旨を出す
const limitStatus = computed(() => {
	const savedFields = keywordFields.value.map(f => f.keywordType === 'keywords' ? normalizeKeywordGroups(initialAntenna.keywords)
		: f.keywordType === 'excludeKeywords' ? normalizeKeywordGroups(initialAntenna.excludeKeywords)
			: normalizeKeywordGroups(initialAntenna.mustExcludeKeywords ?? []));

	for (const [typeIndex, field] of keywordFields.value.entries()) {
		const groups = field.groups;
		const location = { keywordType: field.keywordType, groupIndex: 0, keywordIndex: 0 };
		let violation: { reason: string; pattern?: string; location: typeof location } | null = null;
		if (groups.length > REGEX_GROUP_LIMIT) {
			violation = { reason: 'tooManyGroups', location };
		} else {
			outer: for (const [groupIndex, group] of groups.entries()) {
				if (group.length > REGEX_KEYWORDS_PER_GROUP_LIMIT) {
					violation = { reason: 'tooManyKeywords', location: { ...location, groupIndex, keywordIndex: 0 } };
					break;
				}
				for (const [keywordIndex, pattern] of group.entries()) {
					if (pattern.length > REGEX_PATTERN_MAX_LENGTH) {
						violation = { reason: 'patternTooLong', pattern, location: { ...location, groupIndex, keywordIndex } };
						break outer;
					}
				}
			}
		}
		if (violation == null) continue;
		return {
			violation,
			increased: measureExcess(groups) > measureExcess(savedFields[typeIndex] ?? []),
			// 新規作成では超過そのものが保存を止める
			blocksSave: initialAntenna.id == null || measureExcess(groups) > measureExcess(savedFields[typeIndex] ?? []),
		};
	}
	return null;
});

// os.apiWithDialog の汎用表示だと英語のメッセージとIDしか出ないため、
// 保存は自前で呼び、エラーはモードに応じた文言で出し分ける
async function saveAntenna() {
	const antennaData = buildAntennaData();
	const closeWaiting = os.waiting();

	try {
		if (initialAntenna.id == null) {
			const res = await misskeyApi('antennas/create', antennaData);
			// ページ版の作成画面はダイアログと違ってコンポーネントが残るので、保存済みの値も更新する
			savedAntenna.value = { ...savedAntenna.value, ...antennaData };
			emit('created', res);
		} else {
			const res = await misskeyApi('antennas/update', { ...antennaData, antennaId: initialAntenna.id });
			savedAntenna.value = { ...savedAntenna.value, ...antennaData };
			emit('updated', res);
		}
	} catch (err) {
		const code = err != null && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
		const info = (err as { info?: unknown } | null)?.info;
		await os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: code === 'INVALID_REGEX' ? describeKeywordError(info, false)
				: code === 'KEYWORD_LIMIT_EXCEEDED' ? describeKeywordError(info, true)
					: (err != null && typeof err === 'object' && 'message' in err) ? String((err as { message?: unknown }).message) : String(err),
		});
	} finally {
		closeWaiting();
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

	name.value = savedAntenna.value.name;
	src.value = savedAntenna.value.src;
	userListId.value = savedAntenna.value.userListId;
	users.value = savedAntenna.value.users.join('\n');
	keywords.value = savedAntenna.value.keywords.map(x => [...x]);
	excludeKeywords.value = savedAntenna.value.excludeKeywords.map(x => [...x]);
	mustExcludeKeywords.value = savedAntenna.value.mustExcludeKeywords ? savedAntenna.value.mustExcludeKeywords.map(x => [...x]) : [];
	caseSensitive.value = savedAntenna.value.caseSensitive;
	localOnly.value = savedAntenna.value.localOnly;
	excludeBots.value = savedAntenna.value.excludeBots;
	withReplies.value = savedAntenna.value.withReplies;
	withFile.value = savedAntenna.value.withFile;
	excludeNotesInSensitiveChannel.value = savedAntenna.value.excludeNotesInSensitiveChannel;
	onlyFollowers.value = savedAntenna.value.onlyFollowers;
	isScoringMode.value = savedAntenna.value.expression === 'SCORE';
	keywordMode.value = savedAntenna.value.keywordMode;
	tryResults.value = null;
}

async function tryConditions() {
	const seq = ++trySeq;
	tryRunning.value = true;
	tryResults.value = null;
	try {
		const res = await misskeyApi('antennas/test', buildAntennaData());
		if (seq !== trySeq) return;
		tryResults.value = res;
	} catch (err) {
		if (seq !== trySeq) return;
		const isInvalidRegex = err != null && typeof err === 'object' && (err as { code?: unknown }).code === 'INVALID_REGEX';
		os.alert({
			type: 'error',
			// misskeyApiはAPIエラーをErrorではなく{ message, code }のオブジェクトでrejectする
			text: isInvalidRegex
				? describeKeywordError((err as { info?: unknown }).info, false)
				: (err != null && typeof err === 'object' && 'message' in err) ? String((err as { message?: unknown }).message) : String(err),
		});
	} finally {
		if (seq === trySeq) tryRunning.value = false;
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
