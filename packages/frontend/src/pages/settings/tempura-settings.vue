<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-root" path="/settings/tempura-settings" :label="i18n.ts.originalFeature" :keywords="['tempura', 'fork', 'original']" icon="ti ti-git-fork">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f371.png" color="#fa8072">
			<SearchText>{{ i18n.ts._tempuraSettings.banner }}</SearchText>
		</MkFeatureBanner>

		<FormSection first>
			<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.groupAppearance }}</SearchLabel></template>
			<div class="_gaps_s">
				<AppearanceSettings/>
				<TimelineSettings/>
				<BehaviorSettings/>
			</div>
		</FormSection>

		<FormSection>
			<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.groupNotes }}</SearchLabel></template>
			<div class="_gaps_s">
				<PostFormSettings/>
				<NotesSettings/>
			</div>
		</FormSection>

		<FormSection>
			<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.groupPrivacy }}</SearchLabel></template>
			<div class="_gaps_s">
				<PrivacySettings/>
				<ProfileSettings/>
			</div>
		</FormSection>

		<FormSection>
			<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.groupIntegration }}</SearchLabel></template>
			<div class="_gaps_s">
				<LLMSettings/>
				<EarthquakeSettings/>
			</div>
		</FormSection>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import FormSection from '@/components/form/section.vue';

const AppearanceSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-appearance.vue'));
const TimelineSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-timeline.vue'));
const BehaviorSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-behavior.vue'));
const PostFormSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-postform.vue'));
const NotesSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-notes.vue'));
const PrivacySettings = defineAsyncComponent(() => import('./tempura-settings/tempura-privacy.vue'));
const ProfileSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-profile.vue'));
const LLMSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-llm.vue'));
const EarthquakeSettings = defineAsyncComponent(() => import('./tempura-settings/tempura-earthquake.vue'));

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.originalFeature,
	icon: 'ti ti-git-fork',
}));
</script>
