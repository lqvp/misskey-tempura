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

			<MkSelect v-if="earthquakeWarningSound" v-model="earthquakeWarningSoundType">
				<template #label>{{ i18n.ts._earthquakeWarning.soundType }}</template>
				<option value="auto">{{ i18n.ts._earthquakeWarning.soundTypeAuto }}</option>
				<option value="eew">{{ i18n.ts._earthquakeWarning.soundTypeEew }}</option>
				<option value="info">{{ i18n.ts._earthquakeWarning.soundTypeInfo }}</option>
				<template #caption>{{ i18n.ts._earthquakeWarning.soundTypeCaption }}</template>
			</MkSelect>

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

			<!-- 地域フィルタリング設定 -->
			<fieldset>
				<legend>{{ i18n.ts._earthquakeWarning.regionFilter }}</legend>
				<div class="_gaps_s">
					<MkSwitch v-model="enableEarthquakeWarningRegionFilter">
						<template #label>{{ i18n.ts._earthquakeWarning.regionFilterEnable }}</template>
						<template #caption>{{ i18n.ts._earthquakeWarning.regionFilterCaption }}</template>
					</MkSwitch>

					<div v-if="enableEarthquakeWarningRegionFilter">
						<MkFolder :defaultOpen="false">
							<template #label>{{ i18n.ts._earthquakeWarning.regionFilterAreaLabel }}</template>
							<div class="_gaps_s region-switches">
								<MkSwitch v-model="regionFilters.hokkaido">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.hokkaido }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.tohoku">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.tohoku }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.kanto">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.kanto }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.chubu">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.chubu }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.kinki">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.kinki }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.chugoku">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.chugoku }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.shikoku">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.shikoku }}
								</MkSwitch>
								<MkSwitch v-model="regionFilters.kyushu">
									{{ i18n.ts._earthquakeWarning.regionFilterAreas.kyushu }}
								</MkSwitch>
							</div>
							<p class="_caption">{{ i18n.ts._earthquakeWarning.regionFilterAreaCaption }}</p>
						</MkFolder>
					</div>
				</div>
			</fieldset>

			<!-- 通知抑制設定 -->
			<MkInput v-model="earthquakeWarningThrottleTime" type="number" step="10" :min="0">
				<template #label>{{ i18n.ts._earthquakeWarning.throttleTime }}</template>
				<template #caption>{{ i18n.ts._earthquakeWarning.throttleTimeCaption }}</template>
			</MkInput>

			<!-- 訓練報スキップ設定 -->
			<MkSwitch v-model="earthquakeWarningIgnoreTraining">
				<template #label>{{ i18n.ts._earthquakeWarning.ignoreTraining }}</template>
				<template #caption>{{ i18n.ts._earthquakeWarning.ignoreTrainingCaption }}</template>
			</MkSwitch>

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
	<div class="_buttons">
		<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, reactive, watch, onMounted } from 'vue';
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

const earthquakeWarningSoundType = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningSoundType.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningSoundType', value);
	},
});

// 地域フィルタリング設定
const enableEarthquakeWarningRegionFilter = computed({
	get: () => defaultStore.reactiveState.enableEarthquakeWarningRegionFilter.value,
	set: (value) => {
		defaultStore.set('enableEarthquakeWarningRegionFilter', value);
	},
});

// 選択された地域をリアクティブに管理するためのオブジェクト
const regionFilters = reactive({
	hokkaido: false,
	tohoku: false,
	kanto: false,
	chubu: false,
	kinki: false,
	chugoku: false,
	shikoku: false,
	kyushu: false,
});

// 地域フィルタの取得・設定
watch(regionFilters, () => {
	const regions = [];
	for (const [region, selected] of Object.entries(regionFilters)) {
		if (selected) regions.push(region);
	}
	defaultStore.set('earthquakeWarningRegionFilter', regions);
}, { deep: true });

// 初期値の設定
onMounted(() => {
	const selectedRegions = defaultStore.reactiveState.earthquakeWarningRegionFilter.value || [];
	for (const region of selectedRegions) {
		if (region in regionFilters) {
			regionFilters[region] = true;
		}
	}
});

// 通知抑制時間設定
const earthquakeWarningThrottleTime = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningThrottleTime.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningThrottleTime', value);
	},
});

// 訓練報スキップ設定
const earthquakeWarningIgnoreTraining = computed({
	get: () => defaultStore.reactiveState.earthquakeWarningIgnoreTraining.value,
	set: (value) => {
		defaultStore.set('earthquakeWarningIgnoreTraining', value);
	},
});

/**
 * 設定を保存してページをリロードし、WebSocketの接続を更新します
 */
async function save() {
	await reloadAsk({
		reason: i18n.ts.reloadToApplySetting,
		unison: true,
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
