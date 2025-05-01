<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<SearchMarker markerId="tempura-settings-root" path="/settings/tempura-settings" :label="i18n.ts.originalFeature" :keywords="['temp']" icon="ti ti-git-fork">
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
			<NoteBottomSettings/>
			<TimeLineSettings/>
			<LLMSettings/>
			<EarthquakeSettings/>
		</div>
	</SearchMarker>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkSparkle from '@/components/MkSparkle.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';

const ProfileSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-profile.vue'));
const PrivacySettings = defineAsyncComponent(() => import('./tempura-settings/tempura-privacy.vue'));
const NotesSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-notes.vue'));
const AppearanceSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-appearance.vue'));
const BehaviorSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-behavior.vue'));
const DriveSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-drive.vue'));
const PostFormSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-postform.vue'));
const NoteBottomSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-notebottom.vue'));
const TimeLineSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-timeline.vue'));
const LLMSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-llm.vue'));
const EarthquakeSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-earthquake.vue'));

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: 'tempura-fork',
	icon: 'ti ti-adjustments',
}));
</script>

<style lang="scss">
.tempura-settings-section {
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
