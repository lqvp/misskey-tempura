<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-timeline" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['timeline', 'feed', 'view', 'display']">
	<MkFolder>
		<template #icon><i class="ti ti-timeline"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.__TL_conf.hideTimelineLabel }}</SearchLabel></template>
		<div class="_gaps_m">
			<div class="_buttons">
				<MkButton inline @click="toggleAllHidden(true)"><SearchLabel>{{ i18n.ts.enableAll }}</SearchLabel></MkButton>
				<MkButton inline @click="toggleAllHidden(false)"><SearchLabel>{{ i18n.ts.disableAll }}</SearchLabel></MkButton>
			</div>
			<SearchMarker :keywords="['local', 'timeline', 'hide']">
				<MkPreferenceContainer k="hideLocalTimeLine">
					<MkSwitch v-model="hideLocalTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideLocalTimeLineDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideLocalTimeLine }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['social', 'timeline', 'hide']">
				<MkPreferenceContainer k="hideSocialTimeLine">
					<MkSwitch v-model="hideSocialTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideSocialTimeLineDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideSocialTimeLine }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['global', 'timeline', 'hide']">
				<MkPreferenceContainer k="hideGlobalTimeLine">
					<MkSwitch v-model="hideGlobalTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideGlobalTimeLineDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideGlobalTimeLine }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['lists', 'hide']">
				<MkPreferenceContainer k="hideLists">
					<MkSwitch v-model="hideLists">
						<template #caption>{{ i18n.ts.__TL_conf.hideListsDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideLists }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['antennas', 'hide']">
				<MkPreferenceContainer k="hideAntennas">
					<MkSwitch v-model="hideAntennas">
						<template #caption>{{ i18n.ts.__TL_conf.hideAntennasDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideAntennas }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['channel', 'hide']">
				<MkPreferenceContainer k="hideChannel">
					<MkSwitch v-model="hideChannel">
						<template #caption>{{ i18n.ts.__TL_conf.hideChannelDescription }}</template>
						<SearchLabel>{{ i18n.ts.__TL_conf.hideChannel }}</SearchLabel>
					</MkSwitch>
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
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const hideLocalTimeLine = prefer.model('hideLocalTimeLine');
const hideGlobalTimeLine = prefer.model('hideGlobalTimeLine');
const hideSocialTimeLine = prefer.model('hideSocialTimeLine');
const hideLists = prefer.model('hideLists');
const hideAntennas = prefer.model('hideAntennas');
const hideChannel = prefer.model('hideChannel');

function toggleAllHidden(value: boolean) {
	type TimelineSettingKey = 'hideLocalTimeLine' | 'hideGlobalTimeLine' | 'hideSocialTimeLine' | 'hideLists' | 'hideAntennas' | 'hideChannel';
	const settings: TimelineSettingKey[] = [
		'hideLocalTimeLine',
		'hideGlobalTimeLine',
		'hideSocialTimeLine',
		'hideLists',
		'hideAntennas',
		'hideChannel',
	];

	settings.forEach(setting => {
		prefer.commit(setting, value);
	});
}

</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
