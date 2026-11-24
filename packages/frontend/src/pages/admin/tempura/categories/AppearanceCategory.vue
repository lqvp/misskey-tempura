<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker v-slot="slotProps" markerId="tempuraAdminAppearance" :keywords="['appearance', 'entrance', 'branding', 'splash', 'background', 'cursor', 'icon', 'stats', 'offline', 'blocked']">
	<MkFolder :defaultOpen="slotProps.isParentOfTarget">
		<template #icon><SearchIcon><i class="ti ti-palette"></i></SearchIcon></template>
		<template #label><SearchLabel>{{ i18n.ts._tempuraAdmin.groupAppearance }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :label="i18n.ts._serverSettings.enableLongIconUrl" :keywords="['long', 'icon', 'url', 'logo', i18n.ts._serverSettings.longIconUrl]">
				<LongIconUrl :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.customSplashText" :keywords="['splash', 'loading', 'text', 'custom']">
				<CustomSplashText :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._entrance.title" icon="ti ti-door-enter" :keywords="['entrance', 'landing', 'dashboard', 'home']">
				<EntranceSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker label="はなみすきー風LP" icon="ti ti-flower" :keywords="['hana', 'hanamisskey', 'lp', 'entrance', 'landing']">
				<HanaEntranceSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.backgroundImageUrls" icon="ti ti-photo" :keywords="['background', 'image', 'wallpaper', 'url']">
				<BackgroundImages :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._customCursor.title" icon="ti ti-pointer" :keywords="['cursor', 'custom', 'mouse']">
				<CustomCursor :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.youBlocked" icon="ti ti-ban" :keywords="['blocked', 'image', 'error', 'illustration']">
				<BlockedUserImageSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._serverStats.title" icon="ti ti-server-2" :keywords="['server', 'stats', 'cpu', 'memory', 'disk', 'info']">
				<ServerStatsSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._offlinePageSetting.title" icon="ti ti-wifi-off" :keywords="['offline', 'page', 'error', 'serviceworker', 'message']">
				<OfflinePageSettings :meta="meta"/>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import LongIconUrl from '../sections/LongIconUrl.vue';
import CustomSplashText from '../sections/CustomSplashText.vue';
import EntranceSettings from '../sections/EntranceSettings.vue';
import HanaEntranceSettings from '../sections/HanaEntranceSettings.vue';
import BackgroundImages from '../sections/BackgroundImages.vue';
import CustomCursor from '../sections/CustomCursor.vue';
import BlockedUserImageSettings from '../sections/BlockedUserImageSettings.vue';
import ServerStatsSettings from '../sections/ServerStatsSettings.vue';
import OfflinePageSettings from '../sections/OfflinePageSettings.vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';

defineProps<{
	meta: Misskey.Endpoints['admin/meta']['res'];
}>();
</script>
