<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-alert-triangle"></i></template>
	<template #label>{{ i18n.ts._earthquakeWarning.settings }}</template>
	<div class="_gaps_m">
		<MkInfo>
			<div class="license">
				<MkMfm :text="i18n.ts._earthquakeWarning.license"/>
			</div>
		</MkInfo>
		<MkSwitch v-model="enableEarthquakeWarning">
			{{ i18n.ts._earthquakeWarning.enable }}
			<template #caption>{{ i18n.ts._earthquakeWarning.enableCaption }}</template>
		</MkSwitch>

		<div class="_gaps_s">
			<MkSelect v-model="earthquakeWarningIntensity">
				<template #label>{{ i18n.ts._earthquakeWarning.intensityThreshold }}</template>
				<option value="1">{{ i18n.ts._earthquakeWarning.shindo["1"] || `${i18n.ts._earthquakeWarning.shindo} 1` }}</option>
				<option value="2">{{ i18n.ts._earthquakeWarning.shindo["2"] || `${i18n.ts._earthquakeWarning.shindo} 2` }}</option>
				<option value="3">{{ i18n.ts._earthquakeWarning.shindo["3"] || `${i18n.ts._earthquakeWarning.shindo} 3` }}</option>
				<option value="4">{{ i18n.ts._earthquakeWarning.shindo["4"] || `${i18n.ts._earthquakeWarning.shindo} 4` }}</option>
				<option value="5-">{{ i18n.ts._earthquakeWarning.shindo["5-"] || `${i18n.ts._earthquakeWarning.shindo} 5弱` }}</option>
				<option value="5+">{{ i18n.ts._earthquakeWarning.shindo["5+"] || `${i18n.ts._earthquakeWarning.shindo} 5強` }}</option>
				<option value="6-">{{ i18n.ts._earthquakeWarning.shindo["6-"] || `${i18n.ts._earthquakeWarning.shindo} 6弱` }}</option>
				<option value="6+">{{ i18n.ts._earthquakeWarning.shindo["6+"] || `${i18n.ts._earthquakeWarning.shindo} 6強` }}</option>
				<option value="7">{{ i18n.ts._earthquakeWarning.shindo["7"] || `${i18n.ts._earthquakeWarning.shindo} 7` }}</option>
				<template #caption>{{ i18n.ts._earthquakeWarning.intensityDescription }}</template>
			</MkSelect>

			<MkSelect v-model="earthquakeWarningNotificationStyle">
				<template #label>{{ i18n.ts._earthquakeWarning.notificationStyle }}</template>
				<option value="simple">{{ i18n.ts._earthquakeWarning.notificationStyleSimple }}</option>
				<option value="standard">{{ i18n.ts._earthquakeWarning.notificationStyleStandard }}</option>
				<option value="detailed">{{ i18n.ts._earthquakeWarning.notificationStyleDetailed }}</option>
				<template #caption>{{ i18n.ts._earthquakeWarning.notificationStyleCaption }}</template>
			</MkSelect>

			<MkInput v-model="earthquakeWarningToastDuration" type="number" step="1000" :min="5000">
				<template #label>{{ i18n.ts._earthquakeWarning.toastDuration }}</template>
				<template #caption>{{ i18n.ts._earthquakeWarning.toastDurationCaption }}</template>
			</MkInput>

			<MkSwitch v-model="earthquakeWarningSound">
				<template #label>{{ i18n.ts._earthquakeWarning.soundEnable }}</template>
				<template #caption>{{ i18n.ts._earthquakeWarning.soundEnableCaption }}</template>
			</MkSwitch>

			<MkSwitch v-model="enableEarthquakeWarningTts">
				<template #label>{{ i18n.ts._earthquakeWarning.enableTts }}</template>
				<template #caption>{{ i18n.ts._earthquakeWarning.enableTtsCaption }}</template>
			</MkSwitch>

			<div v-if="enableEarthquakeWarningTts">
				<MkInput v-model="earthquakeWarningTtsRate" type="number" step="0.1" :min="0.1" :max="3.0">
					<template #label>{{ i18n.ts._earthquakeWarning.ttsRate }}</template>
					<template #caption>{{ i18n.ts._earthquakeWarning.ttsRateCaption }}</template>
				</MkInput>
			</div>

			<MkButton
				primary
				@click="testEarthquakeAlert"
			>
				<template #icon><i class="ti ti-bell-ringing"></i></template>
				{{ i18n.ts._earthquakeWarning.testNotification }}
			</MkButton>
			<div class="test-caption">{{ i18n.ts._earthquakeWarning.testNotificationCaption }}</div>
		</div>
	</div>
</MkFolder>

<div class="_buttons">
	<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkMfm from '@/components/global/MkMfm.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { testEarthquakeAlert } from '@/scripts/temp-script/earthquake-warning.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { defaultStore } from '@/store.js';

// State
const enableEarthquakeWarning = computed({
	get: () => defaultStore.reactiveState.enableEarthquakeWarning.value,
	set: (value) => {
		defaultStore.set('enableEarthquakeWarning', value);
	},
});

const earthquakeWarningIntensity = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningIntensity.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningIntensity', value);
	},
});

const enableEarthquakeWarningTts = computed({
	get: () => defaultStore.reactiveState.enableEarthquakeWarningTts.value,
	set: (value) => {
		defaultStore.set('enableEarthquakeWarningTts', value);
	},
});

const earthquakeWarningToastDuration = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningToastDuration.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningToastDuration', value);
	},
});

const earthquakeWarningTtsRate = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningTtsRate.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningTtsRate', value);
	},
});

const earthquakeWarningNotificationStyle = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningNotificationStyle.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningNotificationStyle', value);
	},
});

const earthquakeWarningSound = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningSound.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningSound', value);
	},
});

/**
 * 設定を保存してページをリロードし、WebSocketの接続を更新します
 */
async function save() {
	await reloadAsk({ 
		reason: i18n.ts.reloadToApplySetting, 
		unison: true,
		callback: () => {
			os.success();
		}
	});
}
</script>

<style lang="scss" scoped>
.test-caption {
	color: var(--fgTransparentWeak);
	font-size: 0.85em;
	padding: 8px 0;
}

.license {
	font-size: 0.9em;
	line-height: 1.5;
}
</style>
