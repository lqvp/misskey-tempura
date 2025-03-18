<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-earthQuake">
	<template #icon><i class="ti ti-globe"></i></template>
	<template #header>{{ i18n.ts._widgets.earthQuake }}</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="fetchEarthquakeData()"><i class="ti ti-refresh"></i></button>
		<button class="_button" :class="buttonStyleClass" @click="configure()"><i class="ti ti-settings"></i></button>
	</template>

	<div :class="$style.root">
		<MkLoading v-if="fetching"/>
		<div v-else>
			<div v-if="quakes.length">
				<div :class="$style.earthquakeList">
					<div v-for="(quake, index) in quakes" :key="index" :class="$style.quakeItem">
						<div :class="$style.intensityNumber" :style="{backgroundColor: getShindoColor(quake.shindo).bg, color: getShindoColor(quake.shindo).fg}">
							{{ quake.shindo }}
						</div>
						<div :class="$style.quakeDetails">
							<div :class="$style.location">{{ quake.location }}</div>
							<div :class="$style.datetime">{{ formatDateTime(quake.time) }}</div>
						</div>
						<div :class="$style.rightInfo">
							<div :class="$style.magnitude">{{ formatMagnitude(quake.magnitude) }}</div>
							<div :class="$style.depth">{{ i18n.ts._widgets._eq.depth }}: {{ quake.depth }}</div>
						</div>
					</div>
				</div>
			</div>
			<div v-else>
				<div :class="$style.noData">{{ i18n.ts.nothing }}</div>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import MkContainer from '@/components/MkContainer.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';

// Define the widget props type
type WidgetProps = {
	showHeader: boolean;
	apiUrl: string;
	refreshIntervalSec: number;
	historyCount: number;
};

const name = 'earthQuake';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: true,
	},
	apiUrl: {
		type: 'string' as const,
		default: 'https://api.wolfx.jp/jma_eqlist.json',
	},
	refreshIntervalSec: {
		type: 'number' as const,
		default: 60,
	},
	historyCount: {
		type: 'number' as const,
		default: 4,
	},
};

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

// Define types for earthquake data structure
interface EarthquakeInfo {
	shindo: string | number;
	location: string;
	time: string;
	magnitude: string | number;
	depth: string;
}

interface EarthquakeData {
	md5: string;
	[key: `No${number}`]: EarthquakeInfo;
}

const earthquakeData = ref<EarthquakeData | null>(null);
const fetching = ref(true);
const md5 = ref('');
let intervalId: ReturnType<typeof setTimeout> | null = null;

// Updated getShindoColor with switch for type safety
function getShindoColor(shindoValue: string | number): { bg: string; fg: string } {
	const value = String(shindoValue);
	switch (value) {
		case '1':
			return { bg: '#6B7878', fg: '#FFFFFF' };
		case '2':
			return { bg: '#1E6EE6', fg: '#FFFFFF' };
		case '3':
			return { bg: '#32B464', fg: '#FFFFFF' };
		case '4':
			return { bg: '#FFE05D', fg: '#080808' };
		case '5弱':
		case '5-':
			return { bg: '#FFAA13', fg: '#080808' };
		case '5強':
		case '5+':
			return { bg: '#EF700F', fg: '#080808' };
		case '6弱':
		case '6-':
			return { bg: '#E60000', fg: '#FFFFFF' };
		case '6強':
		case '6+':
			return { bg: '#A00000', fg: '#FFFFFF' };
		case '7':
			return { bg: '#5D0090', fg: '#FFFFFF' };
		default:
			return { bg: 'var(--MI_THEME-panel)', fg: 'var(--MI_THEME-fg)' };
	}
}

// Format earthquake time to match screenshot format (YYYY/MM/DD HH:MM)
function formatDateTime(time: string): string {
	const date = new Date(time);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return `${year}/${month}/${day} ${hours}:${minutes}`;
}

// Computed property to transform earthquakeData into an array of earthquakes
const quakes = computed(() => {
	if (!earthquakeData.value) return [];
	const count = widgetProps.historyCount;
	const qs: EarthquakeInfo[] = [];
	for (let i = 1; i <= count; i++) {
		const quake = earthquakeData.value[`No${i}`];
		if (quake) qs.push(quake);
	}
	return qs;
});

function formatMagnitude(magnitudeValue: string | number): string {
	if (magnitudeValue && /^\d+(\.\d+)?$/.test(String(magnitudeValue))) {
		return 'M ' + magnitudeValue;
	}
	return '-';
}

// Existing fetchEarthquakeData and interval handling remain unchanged
const fetchEarthquakeData = async () => {
	fetching.value = true;

	try {
		const url = `${widgetProps.apiUrl}?${Date.now()}`;
		const response = await fetch(url);
		const data = await response.json();

		if (!earthquakeData.value || earthquakeData.value.md5 !== data.md5) {
			earthquakeData.value = data;
			md5.value = data.md5;
		}
	} catch (error) {
		console.error('Failed to fetch earthquake data:', error);
	} finally {
		fetching.value = false;
	}
};

watch(() => widgetProps.refreshIntervalSec, () => {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}

	if (widgetProps.refreshIntervalSec > 0) {
		intervalId = setInterval(fetchEarthquakeData, widgetProps.refreshIntervalSec * 1000);
	}
}, { immediate: true });

onMounted(() => {
	fetchEarthquakeData();
});

onUnmounted(() => {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
});

// Define component expose
const widgetId = computed(() => props.widget ? props.widget.id : null);

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: widgetId.value,
});
</script>

<style lang="scss" module>
.root {
  padding: 0;
  font-family: sans-serif;
}

.noData {
  text-align: center;
  padding: 16px;
  color: var(--MI_THEME-fg);
}

.earthquakeList {
  display: flex;
  flex-direction: column;
}

.quakeItem {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--MI_THEME-divider);
}

.intensityNumber {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: bold;
  border-radius: 0;
  margin-right: 8px;
}

.quakeDetails {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.location {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  font-size: 0.9rem;
}

.datetime {
  font-size: 0.8rem;
  color: var(--MI_THEME-fg);
  margin-bottom: 2px;
}

.rightInfo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  text-align: right;
  min-width: 80px;
}

.magnitude {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.depth {
  font-size: 0.8rem;
  color: var(--MI_THEME-fg);
}

.intensityBox {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  margin-left: 10px;
  border-radius: 0;

  :global(.shindominusfirst),
  :global(.shindominus) {
    font-size: 0.75rem;
    position: relative;
    top: 5px;
    right: 1px;
  }

  :global(.shindoplusfirst),
  :global(.shindoplus) {
    font-size: 0.75rem;
    position: relative;
    top: 5px;
    right: 1px;
  }
}
</style>

<style scoped>
.mkw-earthQuake {
  font-family: 'Arial', sans-serif;
  padding: 0;
}
</style>
