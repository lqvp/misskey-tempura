<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkSuspense :p="init">
			<div class="_gaps_m">
				<ApprovalRequired :meta="meta" />
				<BlockMentions :meta="meta" />
				<LongIconUrl :meta="meta" />
				<UsernameMinLength :meta="meta" />
				<CustomSplashText :meta="meta" />
				<EmailDomainSettings :meta="meta" />
				<HanaEntranceSettings :meta="meta" />
				<EntranceSettings :meta="meta" />
				<DefaultFollowedUsers :meta="meta" />
				<BackgroundImages :meta="meta" />
				<CustomCursor :meta="meta" />
				<GeminiSettings :meta="meta" />
				<ContactFormSettings :meta="meta" />
			</div>
		</MkSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import ApprovalRequired from './tempura/sections/ApprovalRequired.vue';
import BlockMentions from './tempura/sections/BlockMentions.vue';
import LongIconUrl from './tempura/sections/LongIconUrl.vue';
import UsernameMinLength from './tempura/sections/UsernameMinLength.vue';
import CustomSplashText from './tempura/sections/CustomSplashText.vue';
import EmailDomainSettings from './tempura/sections/EmailDomainSettings.vue';
import HanaEntranceSettings from './tempura/sections/HanaEntranceSettings.vue';
import EntranceSettings from './tempura/sections/EntranceSettings.vue';
import DefaultFollowedUsers from './tempura/sections/DefaultFollowedUsers.vue';
import BackgroundImages from './tempura/sections/BackgroundImages.vue';
import CustomCursor from './tempura/sections/CustomCursor.vue';
import GeminiSettings from './tempura/sections/GeminiSettings.vue';
import ContactFormSettings from './tempura/sections/ContactFormSettings.vue';

const meta = ref<any>(null);

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
EOF
