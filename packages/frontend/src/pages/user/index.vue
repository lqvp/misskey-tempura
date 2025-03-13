<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<div>
		<div v-if="user">
			<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
				<template v-if="hasTabAccess(tab)">
					<XHome v-if="tab === 'home'" key="home" :user="user" @unfoldFiles="() => { tab = 'files'; }"/>
					<MkSpacer v-else-if="tab === 'notes'" key="notes" :contentMax="800" style="padding-top: 0">
						<XTimeline :user="user"/>
					</MkSpacer>
					<XFiles v-else-if="tab === 'files'" :user="user"/>
					<XActivity v-else-if="tab === 'activity'" key="activity" :user="user"/>
					<XAchievements v-else-if="tab === 'achievements'" key="achievements" :user="user"/>
					<XReactions v-else-if="tab === 'reactions'" key="reactions" :user="user"/>
					<XClips v-else-if="tab === 'clips'" key="clips" :user="user"/>
					<XLists v-else-if="tab === 'lists'" key="lists" :user="user"/>
					<XPages v-else-if="tab === 'pages'" key="pages" :user="user"/>
					<XFlashs v-else-if="tab === 'flashs'" key="flashs" :user="user"/>
					<XGallery v-else-if="tab === 'gallery'" key="gallery" :user="user"/>
					<XRaw v-else-if="tab === 'raw'" key="raw" :user="user"/>
				</template>
				<div v-else class="forbidden">
					<XNotFound/>
				</div>
			</MkHorizontalSwipe>
		</div>
		<div v-else-if="error">
			<MkError @retry="fetchUser()"/>
		</div>
		<div v-else-if="userstatus">
			<MkUserNotFound v-if="userstatus === 'notfound'"/>
			<MkUserSuspended v-else-if="userstatus === 'suspended'"/>
		</div>
		<MkLoading v-else/>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { acct as getAcct } from '@/filters/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import MkUserNotFound from '@/components/MkUserNotFound.vue';
import MkUserSuspended from '@/components/MkUserSuspended.vue';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import XNotFound from '@/pages/not-found.vue';
import { serverContext, assertServerContext } from '@/server-context.js';

const XHome = defineAsyncComponent(() => import('./home.vue'));
const XTimeline = defineAsyncComponent(() => import('./index.timeline.vue'));
const XFiles = defineAsyncComponent(() => import('./files.vue'));
const XActivity = defineAsyncComponent(() => import('./activity.vue'));
const XAchievements = defineAsyncComponent(() => import('./achievements.vue'));
const XReactions = defineAsyncComponent(() => import('./reactions.vue'));
const XClips = defineAsyncComponent(() => import('./clips.vue'));
const XLists = defineAsyncComponent(() => import('./lists.vue'));
const XPages = defineAsyncComponent(() => import('./pages.vue'));
const XFlashs = defineAsyncComponent(() => import('./flashs.vue'));
const XGallery = defineAsyncComponent(() => import('./gallery.vue'));
const XRaw = defineAsyncComponent(() => import('./raw.vue'));

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_USER = !$i && assertServerContext(serverContext, 'user') ? serverContext.user : null;

const props = withDefaults(defineProps<{
	acct: string;
	page?: string;
}>(), {
	page: 'home',
});

const tab = ref(props.page);

const user = ref<null | Misskey.entities.UserDetailed>(CTX_USER);
const error = ref<null | any>(null);
const userstatus = ref<null | any>(null);
const showContent = ref(true);

function fetchUser(): void {
	if (props.acct == null) return;

	const { username, host } = Misskey.acct.parse(props.acct);

	if (CTX_USER && CTX_USER.username === username && CTX_USER.host === host) {
		user.value = CTX_USER;
		return;
	}

	user.value = null;
	misskeyApi('users/show', {
		username,
		host,
	}).then(u => {
		user.value = u;
	}).catch(err => {
		if (err.id && err.id === '4362f8dc-731f-4ad8-a694-be5a88922a24') { // User not found
			userstatus.value = 'notfound';
		} else if (err.id && err.id === 'c1e1b0d6-2b7c-4c1d-9f1d-2d3d6e8d7e7f') { // User suspended
			userstatus.value = 'suspended';
		} else {
			error.value = err;
		}
	});
}

watch(
	[() => props.acct, () => $i],
	() => {
		fetchUser();
	},
	{
		immediate: true,
		deep: true,
	},
);

// アクセス制御のロジック
const hasTabAccess = (tabName: string): boolean => {
	if (!user.value || !$i) return tabName === 'home';

	const isOwner = $i.id === user.value.id;
	const isAdminMod = $i.isAdmin || $i.isModerator;

	switch (tabName) {
		case 'home':
			return true;
		case 'notes':
			return !user.value.isBlocked;
		case 'files':
			return !user.value.isBlocked;
		case 'activity':
			return (!user.value.hideActivity && !user.value.isBlocked) || isOwner || isAdminMod;
		case 'achievements':
			return user.value.host == null && !user.value.isBlocked;
		case 'reactions':
			return (user.value.publicReactions && !user.value.isBlocked) || isOwner || isAdminMod;
		case 'raw':
			return isOwner || isAdminMod;
		case 'clips':
		case 'lists':
		case 'pages':
		case 'flashs':
		case 'gallery':
			return !user.value.isBlocked;
		default:
			return false;
	}
};

// タブ変更時の処理
watch(tab, (newTab) => {
	showContent.value = hasTabAccess(newTab);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => {
	if (!$i || !user.value) return [{
		key: 'home',
		title: i18n.ts.overview,
		icon: 'ti ti-home',
	}];

	const baseTabs = [{
		key: 'home',
		title: i18n.ts.overview,
		icon: 'ti ti-home',
	}];

	if (user.value.isBlocked) return baseTabs;

	const tabs = [
		{
			key: 'notes',
			title: i18n.ts.notes,
			icon: 'ti ti-pencil',
		}, {
			key: 'files',
			title: i18n.ts.files,
			icon: 'ti ti-photo',
		},
	];

	if (($i.id === user.value.id || $i.isAdmin || $i.isModerator) || !user.value.hideActivity) {
		tabs.push({
			key: 'activity',
			title: i18n.ts.activity,
			icon: 'ti ti-chart-line',
		});
	}

	if (user.value.host == null) {
		tabs.push({
			key: 'achievements',
			title: i18n.ts.achievements,
			icon: 'ti ti-medal',
		});
	}

	if (($i.id === user.value.id || $i.isAdmin || $i.isModerator) || user.value.publicReactions) {
		tabs.push({
			key: 'reactions',
			title: i18n.ts.reaction,
			icon: 'ti ti-mood-happy',
		});
	}

	tabs.push(...[
		{
			key: 'clips',
			title: i18n.ts.clips,
			icon: 'ti ti-paperclip',
		},
		{
			key: 'lists',
			title: i18n.ts.lists,
			icon: 'ti ti-list',
		},
		{
			key: 'pages',
			title: i18n.ts.pages,
			icon: 'ti ti-news',
		},
		{
			key: 'flashs',
			title: 'Play',
			icon: 'ti ti-player-play',
		},
		{
			key: 'gallery',
			title: i18n.ts.gallery,
			icon: 'ti ti-icons',
		},
	]);

	if ($i.id === user.value.id || $i.isAdmin || $i.isModerator) {
		tabs.push({
			key: 'raw',
			title: 'Raw',
			icon: 'ti ti-code',
		});
	}

	return [...baseTabs, ...tabs];
});

definePage(() => ({
	title: i18n.ts.user,
	icon: 'ti ti-user',
	...user.value ? {
		title: user.value.name ? `${user.value.name} (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${getAcct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));
</script>

<style lang="scss" scoped>
.forbidden {
	text-align: center;
	padding: 32px;
	color: var(--error);

	> i {
		font-size: 24px;
		margin-bottom: 8px;
	}
}
</style>
