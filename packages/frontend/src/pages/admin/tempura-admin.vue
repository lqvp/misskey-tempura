<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkSuspense :p="init">
			<div v-if="meta" class="_gaps_m">
				<ApprovalRequired :meta="meta"/>
				<BlockMentions :meta="meta"/>
				<LongIconUrl :meta="meta"/>
				<UsernameMinLength :meta="meta"/>
				<SecondsPerSignup :meta="meta"/>
				<CustomSplashText :meta="meta"/>
				<EmailDomainSettings :meta="meta"/>
				<LlmModerationSettings :meta="meta"/>
				<HanaEntranceSettings :meta="meta"/>
				<EntranceSettings :meta="meta"/>
				<DefaultFollowedUsers :meta="meta"/>
				<BackgroundImages :meta="meta"/>
				<CustomCursor :meta="meta"/>
				<GeminiSettings :meta="meta"/>
				<ContactFormSettings :meta="meta"/>
				<LoginRiskSettings :meta="meta"/>
				<ServerStatsSettings :meta="meta"/>
				<SignedApFetchSettings :meta="meta"/>
				<DeeplFreeModeSettings :meta="meta"/>
				<ObjectStorageRemoteSettings :meta="meta"/>
				<BlockedUserImageSettings :meta="meta"/>
			</div>
		</MkSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import ApprovalRequired from './tempura/sections/ApprovalRequired.vue';
import BlockMentions from './tempura/sections/BlockMentions.vue';
import LongIconUrl from './tempura/sections/LongIconUrl.vue';
import UsernameMinLength from './tempura/sections/UsernameMinLength.vue';
import SecondsPerSignup from './tempura/sections/SecondsPerSignup.vue';
import CustomSplashText from './tempura/sections/CustomSplashText.vue';
import EmailDomainSettings from './tempura/sections/EmailDomainSettings.vue';
import LlmModerationSettings from './tempura/sections/LlmModerationSettings.vue';
import HanaEntranceSettings from './tempura/sections/HanaEntranceSettings.vue';
import EntranceSettings from './tempura/sections/EntranceSettings.vue';
import DefaultFollowedUsers from './tempura/sections/DefaultFollowedUsers.vue';
import BackgroundImages from './tempura/sections/BackgroundImages.vue';
import CustomCursor from './tempura/sections/CustomCursor.vue';
import GeminiSettings from './tempura/sections/GeminiSettings.vue';
import ContactFormSettings from './tempura/sections/ContactFormSettings.vue';
import LoginRiskSettings from './tempura/sections/LoginRiskSettings.vue';
import ServerStatsSettings from './tempura/sections/ServerStatsSettings.vue';
import SignedApFetchSettings from './tempura/sections/SignedApFetchSettings.vue';
import DeeplFreeModeSettings from './tempura/sections/DeeplFreeModeSettings.vue';
import ObjectStorageRemoteSettings from './tempura/sections/ObjectStorageRemoteSettings.vue';
import BlockedUserImageSettings from './tempura/sections/BlockedUserImageSettings.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const meta = ref<Misskey.Endpoints['admin/meta']['res'] | null>(null);

async function init() {
	meta.value = await misskeyApi('admin/meta');
}

const headerActions = ref([]);
const headerTabs = ref([]);
definePage(() => ({
	title: i18n.ts.moderation,
	icon: 'ti ti-shield',
}));
</script>
