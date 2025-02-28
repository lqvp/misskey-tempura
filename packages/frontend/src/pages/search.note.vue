<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<MkInput
			v-model="searchQuery"
			large
			autofocus
			type="search"
			@enter.prevent="search"
		>
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>
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
		<MkFoldableSection expanded>
			<template #header>{{ i18n.ts.options }}</template>

			<div class="_gaps_m">
				<MkRadios v-model="searchScope">
					<option v-if="instance.federation !== 'none' && noteSearchableScope === 'global'" value="all">{{ i18n.ts._search.searchScopeAll }}</option>
					<option value="local">{{ instance.federation === 'none' ? i18n.ts._search.searchScopeAll : i18n.ts._search.searchScopeLocal }}</option>
					<option v-if="instance.federation !== 'none' && noteSearchableScope === 'global'" value="server">{{ i18n.ts._search.searchScopeServer }}</option>
					<option value="user">{{ i18n.ts._search.searchScopeUser }}</option>
				</MkRadios>

				<div v-if="instance.federation !== 'none' && searchScope === 'server'" :class="$style.subOptionRoot">
					<MkInput
						v-model="hostInput"
						:placeholder="i18n.ts._search.serverHostPlaceholder"
						@enter.prevent="search"
					>
						<template #label>{{ i18n.ts._search.pleaseEnterServerHost }}</template>
						<template #prefix><i class="ti ti-server"></i></template>
					</MkInput>
				</div>

				<div v-if="searchScope === 'user'" :class="$style.subOptionRoot">
					<div :class="$style.userSelectLabel">{{ i18n.ts._search.pleaseSelectUser }}</div>
					<div class="_gaps">
						<div v-if="user == null" :class="$style.userSelectButtons">
							<div v-if="$i != null">
								<MkButton
									transparent
									:class="$style.userSelectButton"
									@click="selectSelf"
								>
									<div :class="$style.userSelectButtonInner">
										<span><i class="ti ti-plus"></i><i class="ti ti-user"></i></span>
										<span>{{ i18n.ts.selectSelf }}</span>
									</div>
								</MkButton>
							</div>
							<div :style="$i == null ? 'grid-column: span 2;' : undefined">
								<MkButton
									transparent
									:class="$style.userSelectButton"
									@click="selectUser"
								>
									<div :class="$style.userSelectButtonInner">
										<span><i class="ti ti-plus"></i></span>
										<span>{{ i18n.ts.selectUser }}</span>
									</div>
								</MkButton>
							</div>
						</div>
						<div v-else :class="$style.userSelectedButtons">
							<div style="overflow: hidden;">
								<MkUserCardMini
									:user="user"
									:withChart="false"
									:class="$style.userSelectedCard"
								/>
							</div>
							<div>
								<button
									class="_button"
									:class="$style.userSelectedRemoveButton"
									@click="removeUser"
								>
									<i class="ti ti-x"></i>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</MkFoldableSection>
		<div style="display: flex; gap: 12px; justify-content: center;">
			<MkButton
				large
				primary
				gradate
				rounded
				:disabled="!(searchParams != null || (user !== null && visibilitySelect !== 'all'))"
				style="margin: 0 auto;"
				@click="search"
			>
				{{ i18n.ts.search }}
			</MkButton>
			<MkButton
				large
				primary
				rounded
				:disabled="!(searchParams != null || (user !== null && visibilitySelect !== 'all'))"
				style="margin: 0 auto;"
				@click="copySearchUrl"
			>
				{{ i18n.ts.copySearchUrl }}
				<i class="ti ti-link"></i>
			</MkButton>
		</div>
	</div>

	<MkFoldableSection v-if="notePagination">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkNotes :key="`searchNotes:${key}`" :pagination="notePagination"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef, toRef } from 'vue';
import { host as localHost } from '@@/js/config.js';
import type * as Misskey from 'misskey-js';
import type { Paging } from '@/components/MkPagination.vue';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { useRouter } from '@/router/supplier.js';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInput from '@/components/MkInput.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkFolder from '@/components/MkFolder.vue';

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
const notePagination = ref<Paging<'notes/search'>>();

const searchQuery = ref(toRef(props, 'query').value);
const hostInput = ref(toRef(props, 'host').value);
const visibilitySelect = ref<'all' | 'public' | 'home' | 'followers' | 'specified'>('all');
const hasFiles = ref<'all' | 'with' | 'without'>('all');
const hasCw = ref<'all' | 'with' | 'without'>('all');
const hasReply = ref<'all' | 'with' | 'without'>('all');
const hasPoll = ref<'all' | 'with' | 'without'>('all');

const user = shallowRef<Misskey.entities.UserDetailed | null>(null);

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const noteSearchableScope = instance.noteSearchableScope ?? 'local';

//#region set user
let fetchedUser: Misskey.entities.UserDetailed | null = null;

if (props.userId) {
	fetchedUser = await misskeyApi('users/show', {
		userId: props.userId,
	}).catch(() => null);
}

if (props.username && fetchedUser == null) {
	fetchedUser = await misskeyApi('users/show', {
		username: props.username,
		...(props.host ? { host: props.host } : {}),
	}).catch(() => null);
}

if (fetchedUser != null) {
	if (!(noteSearchableScope === 'local' && fetchedUser.host != null)) {
		user.value = fetchedUser;
	}
}
//#endregion

const searchScope = ref<'all' | 'local' | 'server' | 'user'>((() => {
	if (user.value != null) return 'user';
	if (noteSearchableScope === 'local') return 'local';
	if (hostInput.value) return 'server';
	return 'all';
})());

type SearchParams = {
	readonly query: string;
	readonly host?: string;
	readonly userId?: string;
};

const fixHostIfLocal = (target: string | null | undefined) => {
	if (!target || target === localHost) return '.';
	return target;
};

const searchParams = computed<SearchParams | null>(() => {
	const trimmedQuery = searchQuery.value.trim();
	if (!trimmedQuery) return null;

	if (searchScope.value === 'user') {
		if (user.value == null) return null;
		return {
			query: trimmedQuery,
			host: fixHostIfLocal(user.value.host),
			userId: user.value.id,
		};
	}

	if (instance.federation !== 'none' && searchScope.value === 'server') {
		let trimmedHost = hostInput.value?.trim();
		if (!trimmedHost) return null;
		if (trimmedHost.startsWith('https://') || trimmedHost.startsWith('http://')) {
			try {
				trimmedHost = new URL(trimmedHost).host;
			} catch (err) { /* empty */ }
		}
		return {
			query: trimmedQuery,
			host: fixHostIfLocal(trimmedHost),
		};
	}

	if (instance.federation === 'none' || searchScope.value === 'local') {
		return {
			query: trimmedQuery,
			host: '.',
		};
	}

	return {
		query: trimmedQuery,
	};
});

function selectUser() {
	os.selectUser({
		includeSelf: true,
		localOnly: instance.noteSearchableScope === 'local',
	}).then(_user => {
		user.value = _user;
	});
}

function selectSelf() {
	user.value = $i;
}

function removeUser() {
	user.value = null;
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

	if (searchScope.value === 'local') {
		params.set('host', 'local');
	} else if (searchScope.value === 'server' && hostInput.value) {
		params.set('host', hostInput.value);
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
	const allowEmptySearch = user.value !== null && visibilitySelect.value !== 'all';
	if (searchParams.value == null && !allowEmptySearch) return;

	const params = {
		visibility: visibilitySelect.value,
		hasFiles: hasFiles.value,
		hasCw: hasCw.value,
		hasReply: hasReply.value,
		hasPoll: hasPoll.value,
	};

	//#region AP lookup
	if (searchParams.value) {
		if (searchParams.value.query) {
			if (searchParams.value.query.startsWith('https://') && !searchParams.value.query.includes(' ')) {
				const confirm = await os.confirm({
					type: 'info',
					text: i18n.ts.lookupConfirm,
				});
				if (!confirm.canceled) {
					const promise = misskeyApi('ap/show', {
						uri: searchParams.value.query,
					});

					os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

					const res = await promise;

					if (res.type === 'User') {
						router.push(`/@${res.object.username}@${res.object.host}`);
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					} else if (res.type === 'Note') {
						router.push(`/notes/${res.object.id}`);
					}

					return;
				}
			}
		}
		if (searchParams.value.query.length > 1 && !searchParams.value.query.includes(' ')) {
			if (searchParams.value.query.startsWith('@')) {
				const confirm = await os.confirm({
					type: 'info',
					text: i18n.ts.lookupConfirm,
				});
				if (!confirm.canceled) {
					router.push(`/${searchParams.value.query}`);
					return;
				}
			}

			if (searchParams.value.query.startsWith('#')) {
				const confirm = await os.confirm({
					type: 'info',
					text: i18n.ts.openTagPageConfirm,
				});
				if (!confirm.canceled) {
					router.push(`/tags/${encodeURIComponent(searchParams.value.query.substring(1))}`);
					return;
				}
			}
		}
	}
	//#endregion


	if (searchParams.value) {
		if (searchParams.value.query) {
			params.query = searchParams.value.query;
		}
		if (searchParams.value.host) {
			params.host = searchParams.value.host;
		}
		if (searchParams.value.userId) {
			params.userId = searchParams.value.userId;
		}
	}
	else if (allowEmptySearch) {
		params.userId = user.value.id;

		if (user.value.host) {
			params.host = fixHostIfLocal(user.value.host);
		}
	}

	notePagination.value = {
		endpoint: 'notes/search',
		limit: 10,
		params: params,
	};

	key.value++;
}
</script>
<style lang="scss" module>
.subOptionRoot {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	padding: var(--MI-margin);
}

.userSelectLabel {
	font-size: 0.85em;
	padding: 0 0 8px;
	user-select: none;
}

.userSelectButtons {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 16px;
}

.userSelectButton {
	width: 100%;
	height: 100%;
	padding: 12px;
	border: 2px dashed var(--MI_THEME-fgTransparent);
}

.userSelectButtonInner {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	min-height: 38px;
}

.userSelectedButtons {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
}

.userSelectedRemoveButton {
	width: 32px;
	height: 32px;
	color: #ff2a2a;
}
</style>
