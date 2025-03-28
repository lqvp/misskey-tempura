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
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { fontList } from '@/utility/font';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const customFont = prefer.model('customFont');
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
