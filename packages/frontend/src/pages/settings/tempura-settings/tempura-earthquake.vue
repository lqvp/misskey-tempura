<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-earthquake" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['earthquake', 'alert', 'notification', 'safety']">
	<MkFolder>
		<template #icon><i class="ti ti-alert-triangle"></i></template>
		<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.settings }}</SearchLabel></template>
		<div class="_gaps_m">
			<MkInfo>
				<div class="license">
					<MkMfm :text="i18n.ts._earthquakeWarning.license"/>
				</div>
			</MkInfo>
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-power"></i></template>
				<template #label><SearchLabel>{{ i18n.ts.general }}</SearchLabel></template>

				<SearchMarker :keywords="['earthquake', 'warning', 'enable']">
					<MkPreferenceContainer k="enableEarthquakeWarning">
						<MkSwitch v-model="enableEarthquakeWarning">
							<SearchLabel>{{ i18n.ts._earthquakeWarning.enable }}</SearchLabel>
							<template #caption>{{ i18n.ts._earthquakeWarning.enableCaption }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<div class="_gaps_s">
					<SearchMarker :keywords="['earthquake', 'intensity', 'threshold']">
						<MkPreferenceContainer k="earthquakeWarningIntensity">
							<MkSelect v-model="earthquakeWarningIntensity">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.intensityThreshold }}</SearchLabel></template>
								<option value="1">{{ i18n.tsx._earthquakeWarning.shindo({shindo: 1}) }}</option>
								<option value="2">{{ i18n.tsx._earthquakeWarning.shindo({shindo: 2}) }}</option>
								<option value="3">{{ i18n.tsx._earthquakeWarning.shindo({shindo: 3}) }}</option>
								<option value="4">{{ i18n.tsx._earthquakeWarning.shindo({shindo: 4}) }}</option>
								<option value="5-">{{ i18n.tsx._earthquakeWarning.shindo({shindo: "5-"}) }}</option>
								<option value="5+">{{ i18n.tsx._earthquakeWarning.shindo({shindo: "5+"}) }}</option>
								<option value="6-">{{ i18n.tsx._earthquakeWarning.shindo({shindo: "6-"}) }}</option>
								<option value="6+">{{ i18n.tsx._earthquakeWarning.shindo({shindo: "6+"}) }}</option>
								<option value="7">{{ i18n.tsx._earthquakeWarning.shindo({shindo: 7}) }}</option>
								<template #caption>{{ i18n.ts._earthquakeWarning.intensityDescription }}</template>
							</MkSelect>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'notification', 'display', 'style']">
						<MkPreferenceContainer k="earthquakeWarningNotificationStyle">
							<MkSelect v-model="earthquakeWarningNotificationStyle">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.notificationStyle }}</SearchLabel></template>
								<option value="simple">{{ i18n.ts._earthquakeWarning.notificationStyleSimple }}</option>
								<option value="standard">{{ i18n.ts._earthquakeWarning.notificationStyleStandard }}</option>
								<option value="detailed">{{ i18n.ts._earthquakeWarning.notificationStyleDetailed }}</option>
								<template #caption>{{ i18n.ts._earthquakeWarning.notificationStyleCaption }}</template>
							</MkSelect>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'notification', 'duration', 'time']">
						<MkPreferenceContainer k="earthquakeWarningToastDuration">
							<MkInput v-model="earthquakeWarningToastDuration" type="number" step="1000" :min="5000">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.toastDuration }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.toastDurationCaption }}</template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'sound', 'enable']">
						<MkPreferenceContainer k="earthquakeWarningSound">
							<MkSwitch v-model="earthquakeWarningSound">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.soundEnable }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.soundEnableCaption }}</template>
							</MkSwitch>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'sound', 'type']">
						<MkPreferenceContainer k="earthquakeWarningSoundType">
							<MkSelect v-if="earthquakeWarningSound" v-model="earthquakeWarningSoundType">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.soundType }}</SearchLabel></template>
								<option value="auto">{{ i18n.ts._earthquakeWarning.soundTypeAuto }}</option>
								<option value="eew">{{ i18n.ts._earthquakeWarning.soundTypeEew }}</option>
								<option value="info">{{ i18n.ts._earthquakeWarning.soundTypeInfo }}</option>
								<template #caption>{{ i18n.ts._earthquakeWarning.soundTypeCaption }}</template>
							</MkSelect>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'tts', 'voice', 'speed', 'rate']">
						<MkPreferenceContainer k="enableEarthquakeWarningTts">
							<MkSwitch v-model="enableEarthquakeWarningTts">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.enableTts }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.enableTtsCaption }}</template>
							</MkSwitch>
						</MkPreferenceContainer>

						<div v-if="enableEarthquakeWarningTts" class="_gaps_m">
							<MkPreferenceContainer k="earthquakeWarningTtsVoice">
								<MkSelect v-model="earthquakeWarningTtsVoice">
									<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.ttsVoice }}</SearchLabel></template>
									<option :value="null">{{ i18n.ts._earthquakeWarning.ttsVoiceDefault }}</option>
									<option v-for="voice in availableVoices" :key="voice.voiceURI" :value="voice.voiceURI">
										{{ voice.name }} ({{ voice.lang }})
									</option>
									<template #caption>{{ i18n.ts._earthquakeWarning.ttsVoiceCaption }}</template>
								</MkSelect>
							</MkPreferenceContainer>

							<MkPreferenceContainer k="earthquakeWarningTtsRate">
								<MkInput v-model="earthquakeWarningTtsRate" type="number" step="0.1" :min="0.1" :max="10">
									<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.ttsRate }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._earthquakeWarning.ttsRateCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</div>
					</SearchMarker>

					<!-- 地域フィルタリング設定 -->
					<fieldset>
						<legend><SearchLabel>{{ i18n.ts._earthquakeWarning.regionFilter }}</SearchLabel></legend>
						<div class="_gaps_s">
							<SearchMarker :keywords="['earthquake', 'region', 'filter', 'enable']">
								<MkPreferenceContainer k="enableEarthquakeWarningRegionFilter">
									<MkSwitch v-model="enableEarthquakeWarningRegionFilter">
										<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.regionFilterEnable }}</SearchLabel></template>
										<template #caption>{{ i18n.ts._earthquakeWarning.regionFilterCaption }}</template>
									</MkSwitch>
								</MkPreferenceContainer>
							</SearchMarker>
							<div v-if="enableEarthquakeWarningRegionFilter">
								<!-- TODO: Consider extracting the following region filter switches into a separate, reusable component -->
								<MkFolder :defaultOpen="false">
									<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.regionFilterAreaLabel }}</SearchLabel></template>
									<div class="_gaps_s region-switches">
										<MkSwitch v-model="regionFilters.hokkaido" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.hokkaido">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.hokkaido }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.tohoku" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.tohoku">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.tohoku }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.kanto" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.kanto">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.kanto }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.chubu" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.chubu">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.chubu }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.kinki" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.kinki">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.kinki }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.chugoku" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.chugoku">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.chugoku }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.shikoku" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.shikoku">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.shikoku }}
										</MkSwitch>

										<MkSwitch v-model="regionFilters.kyushu" :aria-label="i18n.ts._earthquakeWarning.regionFilterAreas.kyushu">
											{{ i18n.ts._earthquakeWarning.regionFilterAreas.kyushu }}
										</MkSwitch>
									</div>
									<p class="_caption">{{ i18n.ts._earthquakeWarning.regionFilterAreaCaption }}</p>
								</MkFolder>
							</div>
						</div>
					</fieldset>

					<!-- 通知抑制設定 -->
					<SearchMarker :keywords="['earthquake', 'notification', 'throttle', 'time']">
						<MkPreferenceContainer k="earthquakeWarningThrottleTime">
							<MkInput v-model="earthquakeWarningThrottleTime" type="number" step="10" :min="0">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.throttleTime }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.throttleTimeCaption }}</template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<!-- 訓練報スキップ設定 -->
					<SearchMarker :keywords="['earthquake', 'ignore', 'training', 'test']">
						<MkPreferenceContainer k="earthquakeWarningIgnoreTraining">
							<MkSwitch v-model="earthquakeWarningIgnoreTraining">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.ignoreTraining }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.ignoreTrainingCaption }}</template>
							</MkSwitch>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'report', 'filter', 'mode']">
						<MkPreferenceContainer k="earthquakeWarningReportFilterMode">
							<MkSelect v-model="earthquakeWarningReportFilterMode">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.reportFilterMode }}</SearchLabel></template>
								<option value="any">{{ i18n.ts._earthquakeWarning.reportFilterModeAny }}</option>
								<option value="nth">{{ i18n.ts._earthquakeWarning.reportFilterModeNth }}</option>
								<option value="final">{{ i18n.ts._earthquakeWarning.reportFilterModeFinal }}</option>
								<option value="both">{{ i18n.ts._earthquakeWarning.reportFilterModeBoth }}</option>
								<template #caption>{{ i18n.ts._earthquakeWarning.reportFilterModeCaption }}</template>
							</MkSelect>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'report', 'nth', 'number']">
						<MkPreferenceContainer k="earthquakeWarningReportNumber">
							<MkInput v-model="earthquakeWarningReportNumber" type="number" :min="1" :disabled="!['nth','both'].includes(earthquakeWarningReportFilterMode)">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.reportNumber }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.reportNumberCaption }}</template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'report', 'final', 'only']">
						<MkPreferenceContainer k="earthquakeWarningFinalOnly">
							<MkSwitch v-model="earthquakeWarningFinalOnly" :disabled="!['final','both'].includes(earthquakeWarningReportFilterMode)">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.finalOnly }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.finalOnlyCaption }}</template>
							</MkSwitch>
						</MkPreferenceContainer>
					</SearchMarker>

					<MkButton
						primary
						@click="testEarthquakeAlert"
					>
						<template #icon><i class="ti ti-bell-ringing"></i></template>
						<SearchLabel>{{ i18n.ts._earthquakeWarning.testNotification }}</SearchLabel>
					</MkButton>
					<div class="test-caption">{{ i18n.ts._earthquakeWarning.testNotificationCaption }}</div>
				</div>
			</MkFolder>

			<!-- Connection & Logging Settings -->
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-plug-connected"></i></template>
				<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.connection }}</SearchLabel></template>

				<div class="_gaps_s">
					<SearchMarker :keywords="['earthquake', 'connection', 'notify']">
						<MkPreferenceContainer k="earthquakeWarningConnectionNotify">
							<MkSwitch v-model="earthquakeWarningConnectionNotify">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.connectionNotify }}</SearchLabel></template>
								<template #caption>{{ i18n.ts._earthquakeWarning.connectionNotifyCaption }}</template>
							</MkSwitch>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['earthquake', 'log', 'level']">
						<MkPreferenceContainer k="earthquakeWarningLogLevel">
							<MkSelect v-model="earthquakeWarningLogLevel">
								<template #label><SearchLabel>{{ i18n.ts._earthquakeWarning.loggingLevel }}</SearchLabel></template>
								<option value="none">{{ i18n.ts._earthquakeWarning.loggingLevelNone }}</option>
								<option value="basic">{{ i18n.ts._earthquakeWarning.loggingLevelBasic }}</option>
								<option value="detailed">{{ i18n.ts._earthquakeWarning.loggingLevelDetailed }}</option>
								<template #caption>{{ i18n.ts._earthquakeWarning.loggingLevelCaption }}</template>
							</MkSelect>
						</MkPreferenceContainer>
					</SearchMarker>

					<div v-if="earthquakeWarningLogLevel !== 'none'" class="log-actions">
						<MkButton class="log-button" @click="viewLogs('connection')">
							<template #icon><i class="ti ti-history"></i></template>
							<SearchLabel>{{ i18n.ts._earthquakeWarning.connectionLogs }}</SearchLabel>
						</MkButton>

						<MkButton v-if="earthquakeWarningLogLevel === 'detailed'" class="log-button" @click="viewLogs('data')">
							<template #icon><i class="ti ti-database"></i></template>
							<SearchLabel>{{ i18n.ts._earthquakeWarning.dataLogs }}</SearchLabel>
						</MkButton>

						<MkButton class="log-button" danger @click="clearLogs">
							<template #icon><i class="ti ti-eraser"></i></template>
							<SearchLabel>{{ i18n.ts._earthquakeWarning.clearLogs }}</SearchLabel>
						</MkButton>
					</div>
				</div>
			</MkFolder>

			<div class="_buttons">
				<MkButton primary @click="save">
					<template #icon><i class="ti ti-device-floppy"></i></template>
					{{ i18n.ts.save }}
				</MkButton>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, reactive, watch, onMounted, ref, onBeforeUnmount } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkMfm from '@/components/global/MkMfm.js';
import { reloadAsk } from '@/utility/reload-ask.js';
import { testEarthquakeAlert, getConnectionLogs, getDataLogs, clearAllLogs } from '@/utility/tempura-script/earthquake-warning.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

// State
const enableEarthquakeWarning = computed({
	get: () => prefer.r.enableEarthquakeWarning.value,
	set: (value) => {
		prefer.commit('enableEarthquakeWarning', value);
	},
});

const earthquakeWarningIntensity = computed({
	get: () => prefer.r.earthquakeWarningIntensity.value,
	set: (value) => {
		prefer.commit('earthquakeWarningIntensity', value);
	},
});

const enableEarthquakeWarningTts = computed({
	get: () => prefer.r.enableEarthquakeWarningTts.value,
	set: (value) => {
		prefer.commit('enableEarthquakeWarningTts', value);
	},
});

const earthquakeWarningToastDuration = computed({
	get: () => prefer.r.earthquakeWarningToastDuration.value,
	set: (value) => {
		prefer.commit('earthquakeWarningToastDuration', value);
	},
});

const earthquakeWarningTtsVoice = computed({
	get: () => prefer.r.earthquakeWarningTtsVoice.value,
	set: (value) => {
		prefer.commit('earthquakeWarningTtsVoice', value);
	},
});

const availableVoices = ref<SpeechSynthesisVoice[]>([]);

const populateVoices = () => {
	const voices = window.speechSynthesis.getVoices();
	availableVoices.value = voices.filter(v => v.lang.startsWith('ja'));
	if (availableVoices.value.length === 0) {
		availableVoices.value = voices;
	}
};

const earthquakeWarningTtsRate = computed({
	get: () => prefer.r.earthquakeWarningTtsRate.value,
	set: (value) => {
		prefer.commit('earthquakeWarningTtsRate', value);
	},
});

const earthquakeWarningNotificationStyle = computed({
	get: () => prefer.r.earthquakeWarningNotificationStyle.value,
	set: (value) => {
		prefer.commit('earthquakeWarningNotificationStyle', value);
	},
});

const earthquakeWarningSound = computed({
	get: () => prefer.r.earthquakeWarningSound.value,
	set: (value) => {
		prefer.commit('earthquakeWarningSound', value);
	},
});

const earthquakeWarningSoundType = computed({
	get: () => prefer.r.earthquakeWarningSoundType.value,
	set: (value) => {
		prefer.commit('earthquakeWarningSoundType', value);
	},
});

// 地域フィルタリング設定
const enableEarthquakeWarningRegionFilter = computed({
	get: () => prefer.r.enableEarthquakeWarningRegionFilter.value,
	set: (value) => {
		prefer.commit('enableEarthquakeWarningRegionFilter', value);
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
	const regions: string[] = [];
	for (const [region, selected] of Object.entries(regionFilters) as [string, boolean][]) {
		if (selected) regions.push(region);
	}
	prefer.commit('earthquakeWarningRegionFilter', regions);
}, { deep: true });

// 初期値の設定
onMounted(() => {
	const savedRegions = prefer.r.earthquakeWarningRegionFilter.value;
	if (Array.isArray(savedRegions)) {
		for (const region of savedRegions) {
			regionFilters[region] = true;
		}
	}

	populateVoices();
	if (window.speechSynthesis.onvoiceschanged !== undefined) {
		window.speechSynthesis.onvoiceschanged = populateVoices;
	}
});

onBeforeUnmount(() => {
	if (window.speechSynthesis.onvoiceschanged !== undefined) {
		window.speechSynthesis.onvoiceschanged = null;
	}
});

// 通知抑制時間設定
const earthquakeWarningThrottleTime = computed({
	get: () => prefer.r.earthquakeWarningThrottleTime.value,
	set: (value) => {
		prefer.commit('earthquakeWarningThrottleTime', value);
	},
});

// 訓練報スキップ設定
const earthquakeWarningIgnoreTraining = computed({
	get: () => prefer.r.earthquakeWarningIgnoreTraining.value,
	set: (value) => {
		prefer.commit('earthquakeWarningIgnoreTraining', value);
	},
});

// 接続通知設定
const earthquakeWarningConnectionNotify = computed({
	get: () => prefer.r.earthquakeWarningConnectionNotify.value,
	set: (value) => {
		prefer.commit('earthquakeWarningConnectionNotify', value);
	},
});

// ログレベル設定
const earthquakeWarningLogLevel = computed({
	get: () => prefer.r.earthquakeWarningLogLevel.value,
	set: (value) => {
		prefer.commit('earthquakeWarningLogLevel', value);
	},
});

// 新しい報告フィルタリング設定
const earthquakeWarningReportFilterMode = computed({
	get: () => prefer.r.earthquakeWarningReportFilterMode.value,
	set: (value) => {
		prefer.commit('earthquakeWarningReportFilterMode', value);
	},
});

const earthquakeWarningReportNumber = computed({
	get: () => prefer.r.earthquakeWarningReportNumber.value,
	set: (value) => {
		prefer.commit('earthquakeWarningReportNumber', value);
	},
});

const earthquakeWarningFinalOnly = computed({
	get: () => prefer.r.earthquakeWarningFinalOnly.value,
	set: (value) => {
		prefer.commit('earthquakeWarningFinalOnly', value);
	},
});

/**
 * ログを表示する
 */
function viewLogs(type: 'connection' | 'data') {
	const logs = type === 'connection' ? getConnectionLogs() : getDataLogs();
	const title = type === 'connection'
		? i18n.ts._earthquakeWarning.connectionLogs
		: i18n.ts._earthquakeWarning.dataLogs;

	os.alert({
		title: title,
		text: formatLogs(logs),
		type: 'info',
	});
}

/**
 * ログをフォーマットする
 */
function formatLogs(logs: any[]) {
	if (!logs || logs.length === 0) {
		return i18n.ts.nothing;
	}

	return logs.map(log => {
		const time = log.timestamp.toLocaleTimeString();
		let content = `[${time}] [${log.type}] ${log.message || JSON.stringify(log.data)}`;
		return content;
	}).join('\n');
}

/**
 * すべてのログをクリアする
 */
function clearLogs() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	}).then(({ canceled }) => {
		if (canceled) return;
		clearAllLogs();
		os.success();
	});
}

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

.log-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
}

.log-button {
	flex: 1;
	min-width: 150px;
}

.region-switches {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 12px;
}
</style>
