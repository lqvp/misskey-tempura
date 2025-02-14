<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-timeline"></i></template>
	<template #label>{{ i18n.ts.__TL_conf.hideTimelineLabel }}</template>
	<div class="_gaps_m">
		<div class="_buttons">
			<MkButton inline @click="toggleAllHidden(true)">{{ i18n.ts.enableAll }}</MkButton>
			<MkButton inline @click="toggleAllHidden(false)">{{ i18n.ts.disableAll }}</MkButton>
		</div>
		<MkSwitch v-model="hideLocalTimeLine">
			<template #caption>{{ i18n.ts.__TL_conf.hideLocalTimeLineDescription }}</template>
			{{ i18n.ts.__TL_conf.hideLocalTimeLine }}
		</MkSwitch>
		<MkSwitch v-model="hideSocialTimeLine">
			<template #caption>{{ i18n.ts.__TL_conf.hideSocialTimeLineDescription }}</template>
			{{ i18n.ts.__TL_conf.hideSocialTimeLine }}
		</MkSwitch>
		<MkSwitch v-model="hideGlobalTimeLine">
			<template #caption>{{ i18n.ts.__TL_conf.hideGlobalTimeLineDescription }}</template>
			{{ i18n.ts.__TL_conf.hideGlobalTimeLine }}
		</MkSwitch>
		<MkSwitch v-model="hideLists">
			<template #caption>{{ i18n.ts.__TL_conf.hideListsDescription }}</template>
			{{ i18n.ts.__TL_conf.hideLists }}
		</MkSwitch>
		<MkSwitch v-model="hideAntennas">
			<template #caption>{{ i18n.ts.__TL_conf.hideAntennasDescription }}</template>
			{{ i18n.ts.__TL_conf.hideAntennas }}
		</MkSwitch>
		<MkSwitch v-model="hideChannel">
			<template #caption>{{ i18n.ts.__TL_conf.hideChannelDescription }}</template>
			{{ i18n.ts.__TL_conf.hideChannel }}
		</MkSwitch>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';

const hideLocalTimeLine = computed(defaultStore.makeGetterSetter('hideLocalTimeLine'));
const hideGlobalTimeLine = computed(defaultStore.makeGetterSetter('hideGlobalTimeLine'));
const hideSocialTimeLine = computed(defaultStore.makeGetterSetter('hideSocialTimeLine'));
const hideLists = computed(defaultStore.makeGetterSetter('hideLists'));
const hideAntennas = computed(defaultStore.makeGetterSetter('hideAntennas'));
const hideChannel = computed(defaultStore.makeGetterSetter('hideChannel'));

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
		defaultStore.set(setting, value);
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
