<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer ref="userScroll">
	<template #header>
		<MkPageHeader :actions="headerActions" :displayBackButton="true"/>
	</template>
	<SkUserRecentNotes ref="userRecentNotes" :userId="userId" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withBots="withBots" :withReplies="withReplies" :onlyFiles="onlyFiles"/>
</MkStickyContainer>
</template>

<script setup lang="ts">

import { computed, shallowRef } from 'vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import { PageHeaderItem } from '@/types/page-header.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import SkUserRecentNotes from '@/components/SkUserRecentNotes.vue';
import { acct } from '@/filters/user.js';
import { createModel, createOptions } from '@/scripts/following-feed-utils.js';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';

defineProps<{
	userId: string;
}>();

const userRecentNotes = shallowRef<InstanceType<typeof SkUserRecentNotes>>();
const user = computed(() => userRecentNotes.value?.user);

const {
	withNonPublic,
	withQuotes,
	withBots,
	withReplies,
	onlyFiles,
} = createModel();

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => userRecentNotes.value?.reload(),
	},
	createOptions(),
];

// Based on user/index.vue
definePageMetadata(() => ({
	title: i18n.ts.user,
	icon: 'ti ti-user',
	...user.value ? {
		title: user.value.name ? ` (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${acct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));
</script>
