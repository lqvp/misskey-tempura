<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<MkInput v-model="searchQuery" :large="true" :autofocus="true" type="search" @enter.prevent="search">
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>
		<MkFoldableSection :expanded="true">
			<template #header>{{ i18n.ts.options }}</template>

			<div class="_gaps_m">
				<MkFolder>
					<template #label>{{ i18n.ts._noteSearch.enhanceSearch }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

					<div class="_gaps_s">
						<MkRadios v-model="visibilitySelect">
							<template #label>{{ i18n.ts.visibility }}</template>
							<option value="all" default>{{ i18n.ts.all }}</option>
							<option value="public">{{ i18n.ts._visibility.public	}}</option>
							<option value="home">{{ i18n.ts._visibility.home	}}</option>
							<option value="followers">{{ i18n.ts._visibility.followers	}}</option>
							<option value="specified">{{ i18n.ts._visibility.specified	}}</option>
						</MkRadios>
						<MkRadios v-model="hasFiles">
							<template #label>{{ i18n.ts._noteSearch._type.withFiles }}</template>
							<option value="all">{{ i18n.ts.all }}</option>
							<option value="with">{{ i18n.ts._noteSearch._option.with }}</option>
							<option value="without">{{ i18n.ts._noteSearch._option.without }}</option>
						</MkRadios>
						<MkRadios v-model="hasCw">
							<template #label>{{ i18n.ts._noteSearch._type.cw }}</template>
							<option value="all" default>{{ i18n.ts.all }}</option>
							<option value="with">{{ i18n.ts._noteSearch._option.with }}</option>
							<option value="without">{{ i18n.ts._noteSearch._option.without }}</option>
						</MkRadios>
						<MkRadios v-model="hasReply">
							<template #label>{{ i18n.ts._noteSearch._type.reply }}</template>
							<option value="all" default>{{ i18n.ts.all }}</option>
							<option value="with">{{ i18n.ts._noteSearch._option.with }}</option>
							<option value="without">{{ i18n.ts._noteSearch._option.without }}</option>
						</MkRadios>
						<MkRadios v-model="hasPoll">
							<template #label>{{ i18n.ts._noteSearch._type.poll }}</template>
							<option value="all" default>{{ i18n.ts.all }}</option>
							<option value="with">{{ i18n.ts._noteSearch._option.with }}</option>
							<option value="without">{{ i18n.ts._noteSearch._option.without }}</option>
						</MkRadios>
					</div>
				</MkFolder>

				<template v-if="instance.federation !== 'none'">
					<MkRadios v-model="hostSelect">
						<template #label>{{ i18n.ts.host }}</template>
						<option value="all" default>{{ i18n.ts.all }}</option>
						<option value="local">{{ i18n.ts.local }}</option>
						<option v-if="noteSearchableScope === 'global'" value="specified">{{ i18n.ts.specifyHost }}</option>
					</MkRadios>
					<MkInput v-if="noteSearchableScope === 'global'" v-model="hostInput" :disabled="hostSelect !== 'specified'" :large="true" type="search">
						<template #prefix><i class="ti ti-server"></i></template>
					</MkInput>
				</template>

				<MkFolder :defaultOpen="true">
					<template #label>{{ i18n.ts.specifyUser }}</template>
					<template v-if="user" #suffix>@{{ user.username }}{{ user.host ? `@${user.host}` : "" }}</template>

					<div class="_gaps">
						<div :class="$style.userItem">
							<MkUserCardMini v-if="user" :class="$style.userCard" :user="user" :withChart="false"/>
							<MkButton v-if="user == null && $i != null" transparent :class="$style.addMeButton" @click="selectSelf"><div :class="$style.addUserButtonInner"><span><i class="ti ti-plus"></i><i class="ti ti-user"></i></span><span>{{ i18n.ts.selectSelf }}</span></div></MkButton>
							<MkButton v-if="user == null" transparent :class="$style.addUserButton" @click="selectUser"><div :class="$style.addUserButtonInner"><i class="ti ti-plus"></i><span>{{ i18n.ts.selectUser }}</span></div></MkButton>
							<button class="_button" :class="$style.remove" :disabled="user == null" @click="removeUser"><i class="ti ti-x"></i></button>
						</div>
					</div>
				</MkFolder>
			</div>
		</MkFoldableSection>
		<div style="display: flex; gap: 12px; justify-content: center;">
			<MkButton large primary gradate rounded @click="search">{{ i18n.ts.search }}</MkButton>
			<MkButton large rounded gradate @click="copySearchUrl">
				{{ i18n.ts.copySearchUrl }}
				<i class="ti ti-link"></i>
			</MkButton>
		</div>
	</div>

	<MkFoldableSection v-if="notePagination">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkNotes :key="key" :pagination="notePagination"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, toRef, watch } from 'vue';
import type { UserDetailed } from 'misskey-js/entities.js';
import type { Paging } from '@/components/MkPagination.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkFolder from '@/components/MkFolder.vue';
import { useRouter } from '@/router/supplier.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkRadios from '@/components/MkRadios.vue';
import { $i } from '@/account.js';
import { instance } from '@/instance.js';

const props = withDefaults(defineProps<{
	query?: string;
	userId?: string;
	username?: string;
	host?: string | null;
}>(), {
	query: '',
	userId: undefined,
	username: undefined,
	host: '',
});

const router = useRouter();
const key = ref(0);
const searchQuery = ref(toRef(props, 'query').value);
const notePagination = ref<Paging>();
const user = ref<UserDetailed | null>(null);
const hostInput = ref(toRef(props, 'host').value);
const visibilitySelect = ref<'all' | 'public' | 'home' | 'followers' | 'specified'>('all');
const hasFiles = ref<'all' | 'with' | 'without'>('all');
const hasCw = ref<'all' | 'with' | 'without'>('all');
const hasReply = ref<'all' | 'with' | 'without'>('all');
const hasPoll = ref<'all' | 'with' | 'without'>('all');

const noteSearchableScope = instance.noteSearchableScope ?? 'local';

const hostSelect = ref<'all' | 'local' | 'specified'>('all');

const setHostSelectWithInput = (after: string | undefined | null, before: string | undefined | null) => {
	if (before === after) return;
	if (after === '') hostSelect.value = 'all';
	else hostSelect.value = 'specified';
};

setHostSelectWithInput(hostInput.value, undefined);

watch(hostInput, setHostSelectWithInput);

const searchHost = computed(() => {
	if (hostSelect.value === 'local' || instance.federation === 'none') return '.';
	if (hostSelect.value === 'specified') return hostInput.value;
	return null;
});

if (props.userId != null) {
	misskeyApi('users/show', { userId: props.userId }).then(_user => {
		user.value = _user;
	});
} else if (props.username != null) {
	misskeyApi('users/show', {
		username: props.username,
		...(props.host != null && props.host !== '') ? { host: props.host } : {},
	}).then(_user => {
		user.value = _user;
	});
}

function selectUser() {
	os.selectUser({ includeSelf: true, localOnly: instance.noteSearchableScope === 'local' }).then(_user => {
		user.value = _user;
		hostInput.value = _user.host ?? '';
	});
}

function selectSelf() {
	user.value = $i as UserDetailed | null;
	hostInput.value = null;
}

function removeUser() {
	user.value = null;
	hostInput.value = '';
}

//region Copy search URL
async function copySearchUrl() {
	const params = new URLSearchParams();

	if (searchQuery.value) {
		params.set('q', searchQuery.value);
	}

	if (user.value) {
		params.set('userId', user.value.id);
		if (user.value.username) {
			params.set('username', user.value.username);
		}
		if (user.value.host) {
			params.set('userHost', user.value.host);
		}
	}

	switch (hostSelect.value) {
		case 'local': params.set('host', 'local'); break;
		case 'specified':
			if (hostInput.value) {
				params.set('host', hostInput.value);
			}
			break;
	}

	if (visibilitySelect.value !== 'all') {
		params.set('visibility', visibilitySelect.value);
	}

	if (hasFiles.value !== 'all') {
		params.set('hasFiles', hasFiles.value);
	}

	if (hasCw.value !== 'all') {
		params.set('hasCw', hasCw.value);
	}

	if (hasReply.value !== 'all') {
		params.set('hasReply', hasReply.value);
	}

	if (hasPoll.value !== 'all') {
		params.set('hasPoll', hasPoll.value);
	}

	const url = new URL(window.location.origin + window.location.pathname);
	url.search = params.toString();

	try {
		await navigator.clipboard.writeText(url.toString());
		os.success();
	} catch (err) {
		os.alert({
			type: 'error',
			text: i18n.ts.failedToCopy,
		});
	}
}
//endregion

async function search() {
	const query = searchQuery.value.toString().trim();

	const allowEmptySearch = user.value !== null && visibilitySelect.value !== 'all';
	if ((query === '' || query == null) && !allowEmptySearch) return;

	//#region AP lookup
	if (query.startsWith('https://') && !query.includes(' ')) {
		const confirm = await os.confirm({
			type: 'info',
			text: i18n.ts.lookupConfirm,
		});
		if (!confirm.canceled) {
			const promise = misskeyApi('ap/show', {
				uri: query,
			});

			os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

			const res = await promise;

			if (res.type === 'User') {
				router.push(`/@${res.object.username}@${res.object.host}`);
			} else if (res.type === 'Note') {
				router.push(`/notes/${res.object.id}`);
			}

			return;
		}
	}
	//#endregion

	if (query.length > 1 && !query.includes(' ')) {
		if (query.startsWith('@')) {
			const confirm = await os.confirm({
				type: 'info',
				text: i18n.ts.lookupConfirm,
			});
			if (!confirm.canceled) {
				router.push(`/${query}`);
				return;
			}
		}

		if (query.startsWith('#')) {
			const confirm = await os.confirm({
				type: 'info',
				text: i18n.ts.openTagPageConfirm,
			});
			if (!confirm.canceled) {
				router.push(`/tags/${encodeURIComponent(query.substring(1))}`);
				return;
			}
		}
	}

	notePagination.value = {
		endpoint: 'notes/search',
		limit: 10,
		params: {
			query: query === '' ? undefined : query,
			userId: user.value ? user.value.id : null,
			...(searchHost.value ? { host: searchHost.value } : {}),
			visibility: visibilitySelect.value,
			hasFiles: hasFiles.value,
			hasCw: hasCw.value,
			hasReply: hasReply.value,
			hasPoll: hasPoll.value,
		},
	};

	key.value++;
}
</script>
<style lang="scss" module>
.userItem {
	display: flex;
	justify-content: center;
}
.addMeButton {
  border: 2px dashed var(--MI_THEME-fgTransparent);
	padding: 12px;
	margin-right: 16px;
}
.addUserButton {
  border: 2px dashed var(--MI_THEME-fgTransparent);
	padding: 12px;
	flex-grow: 1;
}
.addUserButtonInner {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	min-height: 38px;
}
.userCard {
	flex-grow: 1;
}
.remove {
	width: 32px;
	height: 32px;
	align-self: center;

	& > i:before {
		color: #ff2a2a;
	}

	&:disabled {
		opacity: 0;
	}
}
</style>
