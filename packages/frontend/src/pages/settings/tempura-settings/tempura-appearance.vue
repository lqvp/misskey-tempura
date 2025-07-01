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
							<MkColorInput v-model="colors.publicNonLtl">
								<template #label>{{ i18n.ts._visibility.public_non_ltl }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorHome">
							<MkColorInput v-model="colors.home">
								<template #label>{{ i18n.ts._visibility.home }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorFollowers">
							<MkColorInput v-model="colors.followers">
								<template #label>{{ i18n.ts._visibility.followers }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorSpecified">
							<MkColorInput v-model="colors.specified">
								<template #label>{{ i18n.ts._visibility.specified }}</template>
							</MkColorInput>
						</MkPreferenceContainer>

						<MkPreferenceContainer k="noteVisibilityColorLocalOnly">
							<MkColorInput v-model="colors.localOnly">
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
import { reactive, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { PREF_DEF } from '@/preferences/def.js';
import { i18n } from '@/i18n.js';
import { fontList } from '@/utility/font';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import MkColorInput from '@/components/MkColorInput.vue';
import MkButton from '@/components/MkButton.vue';

const customFont = prefer.model('customFont');

// Note visibility coloring
const useNoteVisibilityColoring = prefer.model('useNoteVisibilityColoring');

const colors = reactive({
	publicNonLtl: prefer.s.noteVisibilityColorPublicNonLtl,
	home: prefer.s.noteVisibilityColorHome,
	followers: prefer.s.noteVisibilityColorFollowers,
	specified: prefer.s.noteVisibilityColorSpecified,
	localOnly: prefer.s.noteVisibilityColorLocalOnly,
});

const isChanged = computed(() =>
	colors.publicNonLtl !== prefer.s.noteVisibilityColorPublicNonLtl ||
	colors.home !== prefer.s.noteVisibilityColorHome ||
	colors.followers !== prefer.s.noteVisibilityColorFollowers ||
	colors.specified !== prefer.s.noteVisibilityColorSpecified ||
	colors.localOnly !== prefer.s.noteVisibilityColorLocalOnly,
);

function saveColors() {
	if (!isChanged.value) return;

	prefer.commit('noteVisibilityColorPublicNonLtl', colors.publicNonLtl);
	prefer.commit('noteVisibilityColorHome', colors.home);
	prefer.commit('noteVisibilityColorFollowers', colors.followers);
	prefer.commit('noteVisibilityColorSpecified', colors.specified);
	prefer.commit('noteVisibilityColorLocalOnly', colors.localOnly);
}

function resetToDefault() {
	colors.publicNonLtl = PREF_DEF.noteVisibilityColorPublicNonLtl.default;
	colors.home = PREF_DEF.noteVisibilityColorHome.default;
	colors.followers = PREF_DEF.noteVisibilityColorFollowers.default;
	colors.specified = PREF_DEF.noteVisibilityColorSpecified.default;
	colors.localOnly = PREF_DEF.noteVisibilityColorLocalOnly.default;
}
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
