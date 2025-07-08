<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-appearance" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['appearance', 'theme', 'design', 'layout', 'ui']">
	<MkFolder>
		<template #icon><i class="ti ti-letter-case"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.appearance }}</SearchLabel></template>
		<div class="_gaps_m">
			<SearchMarker :keywords="['font']">
				<MkPreferenceContainer k="customFont">
					<MkSelect v-model="customFont">
						<template #label><SearchLabel>{{ i18n.ts.customFont }}</SearchLabel></template>
						<option :value="null">{{ i18n.ts.default }}</option>
						<option v-for="[name, font] of Object.entries(fontList)" :key="name" :value="name">{{ font.name }}</option>
					</MkSelect>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['twitter', 'embed', 'provider']">
				<MkPreferenceContainer k="defaultFxTwitterEmbedProvider">
					<MkSelect v-model="twitterEmbedMode">
						<template #label><SearchLabel>{{ i18n.ts.defaultFxTwitterEmbedProvider }}</SearchLabel></template>
						<option value="fxtwitter">{{ i18n.ts.defaultFxTwitterEmbedProviderOptions.fxtwitter }}</option>
						<option value="custom">{{ i18n.ts.defaultFxTwitterEmbedProviderOptions.custom }}</option>
					</MkSelect>
					<MkInput v-if="twitterEmbedMode === 'custom'" v-model="defaultFxTwitterEmbedProvider">
						<template #label><SearchLabel>{{ i18n.ts.customFxTwitterEmbedProvider }}</SearchLabel></template>
					</MkInput>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['note', 'visibility', 'coloring']">
				<MkFolder :defaultOpen="useNoteVisibilityColoring">
					<template #icon><i class="ti ti-color-swatch"></i></template>
					<template #label><SearchLabel>{{ i18n.ts.noteVisibilityColoring }}</SearchLabel></template>
					<div class="_gaps_m">
						<div>
							{{ i18n.ts.noteVisibilityColoringDescription }}
						</div>
						<MkPreferenceContainer k="useNoteVisibilityColoring">
							<MkSwitch v-model="useNoteVisibilityColoring">
								<SearchLabel>{{ i18n.ts.turnItOn }}</SearchLabel>
							</MkSwitch>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorPublicNonLtl">
							<MkColorInput :key="colorInputKey" v-model="colors.publicNonLtl">
								<template #label>{{ i18n.ts._visibility.public_non_ltl }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorHome">
							<MkColorInput :key="colorInputKey" v-model="colors.home">
								<template #label>{{ i18n.ts._visibility.home }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorFollowers">
							<MkColorInput :key="colorInputKey" v-model="colors.followers">
								<template #label>{{ i18n.ts._visibility.followers }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorSpecified">
							<MkColorInput :key="colorInputKey" v-model="colors.specified">
								<template #label>{{ i18n.ts._visibility.specified }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorLocalOnly">
							<MkColorInput :key="colorInputKey" v-model="colors.localOnly">
								<template #label>{{ i18n.ts._visibility.public }}（{{ i18n.ts._visibility.disableFederation }}）</template>
							</MkColorInput>
						</MkPreferenceContainer>
					</div>
					<template #footer>
						<div class="_buttons">
							<MkButton @click="resetToDefault"><i class="ti ti-reload"></i> {{ i18n.ts.resetToDefaultValue }}</MkButton>
							<MkButton primary :disabled="!isChanged" @click="saveColors">
								<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
							</MkButton>
						</div>
					</template>
				</MkFolder>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import { prefer } from '@/preferences.js';
import { PREF_DEF } from '@/preferences/def.js';
import { i18n } from '@/i18n.js';
import { fontList } from '@/utility/font';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import MkColorInput from '@/components/MkColorInput.vue';
import MkButton from '@/components/MkButton.vue';

const customFont = prefer.model('customFont');
const defaultFxTwitterEmbedProvider = prefer.model('defaultFxTwitterEmbedProvider');

// Twitter embed mode computed property
const twitterEmbedMode = computed({
	get: () => {
		return defaultFxTwitterEmbedProvider.value === 'fxtwitter.com' ? 'fxtwitter' : 'custom';
	},
	set: (value: 'fxtwitter' | 'custom') => {
		if (value === 'fxtwitter') {
			defaultFxTwitterEmbedProvider.value = 'fxtwitter.com';
		} else {
			// カスタムモードの場合、現在の値が 'fxtwitter.com' なら空文字にする
			if (defaultFxTwitterEmbedProvider.value === 'fxtwitter.com') {
				defaultFxTwitterEmbedProvider.value = '';
			}
			// すでにカスタム値が入っている場合はそのまま維持
		}
	},
});

// Note visibility coloring
const useNoteVisibilityColoring = prefer.model('useNoteVisibilityColoring');

const colorPrefKeys = {
	publicNonLtl: 'noteVisibilityColorPublicNonLtl',
	home: 'noteVisibilityColorHome',
	followers: 'noteVisibilityColorFollowers',
	specified: 'noteVisibilityColorSpecified',
	localOnly: 'noteVisibilityColorLocalOnly',
} as const;

// Helper to get current colors from the central store
const getColorsFromStore = () => Object.fromEntries(
	Object.entries(colorPrefKeys).map(([key, prefKey]) => [key, prefer.s[prefKey]]),
) as Record<keyof typeof colorPrefKeys, string>;

// Holds the current state of the UI color pickers
const colors = reactive(getColorsFromStore());

// Holds the state of the colors when the component was loaded or last saved
const originalColors = reactive(getColorsFromStore());

// A key to force re-rendering of child components
const colorInputKey = ref(0);

const isChanged = computed(() => {
	return Object.entries(colorPrefKeys).some(([key]) => {
		return colors[key] !== originalColors[key];
	});
});

function saveColors() {
	if (!isChanged.value) return;

	for (const [key, prefKey] of Object.entries(colorPrefKeys)) {
		prefer.commit(prefKey, colors[key]);
	}

	// After saving, update the "original" state to match the new saved state
	Object.assign(originalColors, colors);
}

function resetToDefault() {
	for (const [key, prefKey] of Object.entries(colorPrefKeys)) {
		colors[key] = PREF_DEF[prefKey].default;
	}

	// MkColorInput has reactivity issues with programmatic value changes
	// Force re-render to ensure UI updates correctly
	colorInputKey.value++;
}
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
