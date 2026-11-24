<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker v-slot="slotProps" markerId="tempuraAdminModeration" :keywords="['moderation', 'security', 'spam', 'mention', 'llm', 'login', 'risk', 'contact']">
	<MkFolder :defaultOpen="slotProps.isParentOfTarget || isCategoryTarget" :canPage="false">
		<template #icon><SearchIcon><i class="ti ti-shield"></i></SearchIcon></template>
		<template #label><SearchLabel>{{ i18n.ts._tempuraAdmin.groupModeration }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :label="i18n.ts.blockMentionsFromUnfamiliarRemoteUsers" :keywords="['mention', 'block', 'spam', 'remote', 'moderation']">
				<BlockMentions :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.openLlmModeration" icon="ti ti-shield-check" :keywords="['llm', 'ai', 'moderation', 'queue', 'auto']">
				<LlmModerationSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._loginRisk.title" icon="ti ti-shield-search" :keywords="['login', 'risk', 'security', 'suspicious', 'stepup', 'diagnose']">
				<LoginRiskSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._contactForm._settings.title" icon="ti ti-mail" :keywords="['contact', 'form', 'inquiry', 'report']">
				<ContactFormSettings :meta="meta"/>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import BlockMentions from '../sections/BlockMentions.vue';
import LlmModerationSettings from '../sections/LlmModerationSettings.vue';
import LoginRiskSettings from '../sections/LoginRiskSettings.vue';
import ContactFormSettings from '../sections/ContactFormSettings.vue';
import { useIsCategorySearchTarget } from './use-category-target.js';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';

defineProps<{
	meta: Misskey.Endpoints['admin/meta']['res'];
}>();

const isCategoryTarget = useIsCategorySearchTarget('tempuraAdminModeration');
</script>
