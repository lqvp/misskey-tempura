<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkFeatureBanner icon="/client-assets/package_3d.png" color="#FA8072">
		<MkSparkle>
			<SearchKeyword>{{ i18n.ts.originalFeature }}</SearchKeyword>
		</MkSparkle>
	</MkFeatureBanner>
	<br>
	<div class="_gaps_m">
		<ProfileSettings/>
		<PrivacySettings/>
		<NotesSettings/>
		<AppearanceSettings/>
		<BehaviorSettings/>
		<DriveSettings/>
		<PostFormSettings/>
		<TimeLineSettings/>
		<LLMSettings/>
		<EarthquakeSettings/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkSparkle from '@/components/MkSparkle.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';

const ProfileSettings = defineAsyncComponent(() => import('./temp-settings/temp-profile.vue'));
const PrivacySettings = defineAsyncComponent(() => import('./temp-settings/temp-privacy.vue'));
const NotesSettings = defineAsyncComponent(() => import('./temp-settings/temp-notes.vue'));
const AppearanceSettings = defineAsyncComponent(() => import('./temp-settings/temp-appearance.vue'));
const BehaviorSettings = defineAsyncComponent(() => import('./temp-settings/temp-behavior.vue'));
const DriveSettings = defineAsyncComponent(() => import('./temp-settings/temp-drive.vue'));
const PostFormSettings = defineAsyncComponent(() => import('./temp-settings/temp-postform.vue'));
const TimeLineSettings = defineAsyncComponent(() => import('./temp-settings/temp-timeline.vue'));
const LLMSettings = defineAsyncComponent(() => import('./temp-settings/temp-llm.vue'));
const EarthquakeSettings = defineAsyncComponent(() => import('./temp-settings/temp-earthquake.vue'));

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: 'temp-fork',
	icon: 'ti ti-adjustments',
}));
</script>

<style lang="scss">
.temp-settings-section {
  background: var(--MI_THEME-panel);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  h2 {
    font-size: 1.1em;
    font-weight: 600;
    color: var(--MI_THEME-fg);
    margin: 0 0 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--MI_THEME-divider);
  }
}
</style>
