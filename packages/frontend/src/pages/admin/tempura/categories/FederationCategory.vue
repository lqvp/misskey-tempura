<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker v-slot="slotProps" markerId="tempuraAdminFederation" :keywords="['federation', 'activitypub', 'access', 'anonymous', 'visitor', 'signed', 'proxy', 'follow']">
	<CategoryFolder :shouldOpen="Boolean(slotProps.isParentOfTarget) || isCategoryTarget">
		<template #icon><SearchIcon><i class="ti ti-planet"></i></SearchIcon></template>
		<template #label><SearchLabel>{{ i18n.ts._tempuraAdmin.groupFederation }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :label="i18n.ts._serverSettings.requireSignedApFetch" icon="ti ti-shield-lock" :keywords="['activitypub', 'signed', 'fetch', 'federation', 'signature']">
				<SignedApFetchSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._serverSettings.anonymousVisitorAccess" icon="ti ti-eye-off" :keywords="['anonymous', 'visitor', 'guest', 'access', 'public']">
				<AnonymousAccessSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.proxyAccountFollowMode" icon="ti ti-ghost" :keywords="['proxy', 'account', 'follow', 'federation']">
				<ProxyAccountFollowModeSettings :meta="meta"/>
			</SearchMarker>
		</div>
	</CategoryFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import SignedApFetchSettings from '../sections/SignedApFetchSettings.vue';
import AnonymousAccessSettings from '../sections/AnonymousAccessSettings.vue';
import ProxyAccountFollowModeSettings from '../sections/ProxyAccountFollowModeSettings.vue';
import CategoryFolder from '../CategoryFolder.vue';
import { useIsCategorySearchTarget } from './use-category-target.js';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

defineProps<{
	meta: Misskey.Endpoints['admin/meta']['res'];
}>();

const isCategoryTarget = useIsCategorySearchTarget('tempuraAdminFederation');
</script>
