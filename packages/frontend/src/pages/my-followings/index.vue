<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="recent" :actions="headerActions" :tabs="headerTabs"/></template>
	<div>
	<MkSpacer :contentMax="1000">
		<Transition name="fade" mode="out-in">
			<XFollowingsUpdatesList :anchorDate="anchorDate"/>
		</Transition>
	</MkSpacer>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XFollowingsUpdatesList from './followings-updates-list.vue';
import MkRadios from '@/components/MkRadios.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';

const recent = ref(8.64e+7);
const headerActions = computed(() => []);

const headerTabs = computed(() => [
  { key: 3.6e+6, title: i18n.tsx.recentNHours({n: 1}) },
  { key: 8.64e+7, title: i18n.tsx.recentNDays({n: 1}) },
  { key: 3 * 8.64e+7, title: i18n.tsx.recentNDays({n: 3}) },
  { key: 7 * 8.64e+7, title: i18n.tsx.recentNDays({n: 7}) },
  { key: 30 * 8.64e+7, title: i18n.tsx.recentNDays({n: 30}) },
]);

const anchorDate = computed((previous) => {
  return new Date() - recent.value;
});

definePageMetadata(() => ({
	title: i18n.ts.followingsUpdates,
}));
</script>
