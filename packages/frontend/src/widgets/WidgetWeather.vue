<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-weather">
	<template #icon><i class="ti ti-cloud"></i></template>
	<template #header>{{ i18n.ts._widgets.weather }}</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="openSearchDialog"><i class="ti ti-search"></i></button>
		<button class="_button" :class="buttonStyleClass" @click="refreshWeatherData"><i class="ti ti-refresh"></i></button>
		<button class="_button" :class="buttonStyleClass" @click="configure"><i class="ti ti-settings"></i></button>
	</template>

	<div>
		<MkLoading v-if="fetching"/>
		<div v-else class="weather-container">
			<div class="weather-days">
				<div v-for="(forecast, index) in forecasts" :key="index" class="weather-day">
					<div class="weather-date">{{ formatDate(forecast.date) }} ({{ forecast.dateLabel }})</div>
					<img :src="forecast.image.url" :alt="forecast.telop" class="weather-icon"/>
					<div class="weather-temp">
						<span class="temp-max">{{ getMaxTemp(forecast) }}°C</span>
						<span class="temp-separator"> / </span>
						<span class="temp-min">{{ getMinTemp(forecast) }}°C</span>
					</div>
					<div v-if="widgetProps.showChanceOfRain" class="weather-pop">
						<span v-for="(value, key) in forecast.chanceOfRain" :key="key" class="pop-item">
							{{ value }}<span v-if="!isLast(String(key), forecast.chanceOfRain)" class="pop-separator"> / </span>
						</span>
					</div>
				</div>
			</div>
			<div class="weather-update-time">
				{{ publishingOffice }} |
				{{ publicTimeFormatted }} |
				{{ updateTime }}<br>
				<a :href="copyright.link" target="_blank" class="copyright-link">{{ copyright.title }}</a>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const name = i18n.ts._widgets.weather;

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: true,
	},
	cityId: {
		type: 'string' as const,
		default: '130010', // 東京
	},
	refreshIntervalSec: {
		type: 'number' as const,
		default: 3600,
	},
	showChanceOfRain: {
		type: 'boolean' as const,
		default: false,
	},
	primaryAreaXmlUrl: {
		type: 'string' as const,
		default: 'https://raw.githubusercontent.com/tsukumijima/weather-api/refs/heads/master/public/primary_area.xml',
	},
	info: {
		type: 'string' as const,
		multiline: true,
		default: '出典：天気予報 API（livedoor 天気互換）\nhttps://weather.tsukumijima.net/\n気象庁のデータを利用しています',
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const fetching = ref(true);
const weatherData = ref<any>(null);
const updateTime = ref('');
const publishingOffice = ref('');
const publicTimeFormatted = ref('');
const intervalId = ref<number | null>(null);
const copyright = ref({ title: '', link: '' });

const forecasts = computed(() => weatherData.value?.forecasts || []);

const fetchWeatherData = async () => {
	try {
		fetching.value = true;
		const response = await window.fetch(`https://weather.tsukumijima.net/api/forecast/city/${widgetProps.cityId}`);
		const data = await response.json();
		weatherData.value = data;
		publishingOffice.value = data.publishingOffice;
		publicTimeFormatted.value = data.publicTimeFormatted;
		copyright.value = data.copyright;
		updateTime.value = new Date().toLocaleTimeString();
	} catch (error) {
		console.error('Failed to fetch weather data:', error);
	}
	fetching.value = false;
};

const refreshWeatherData = () => {
	fetchWeatherData();
};

const formatDate = (dateString: string) => {
	const date = new Date(dateString);
	return `${date.getMonth() + 1}/${date.getDate()}`;
};

const getMaxTemp = (forecast: any) => {
	return forecast.temperature.max?.celsius ?? '?';
};

const getMinTemp = (forecast: any) => {
	return forecast.temperature.min?.celsius ?? '?';
};

const isLast = (key: string, obj: object) => {
	const keys = Object.keys(obj);
	return keys.indexOf(key) === keys.length - 1;
};

const setupAutoRefresh = () => {
	if (intervalId.value) {
		window.clearInterval(intervalId.value);
		intervalId.value = null;
	}
	if (widgetProps.refreshIntervalSec > 0) {
		intervalId.value = window.setInterval(() => {
			fetchWeatherData();
		}, widgetProps.refreshIntervalSec * 1000);
	}
};

const normalizePrefName = (prefName: string): string => {
	return prefName
		.replace(/[都府県]$/, '')
		.toLowerCase()
		.trim();
};

interface City {
	id: string;
	title: string;
	pref: string;
}

const fetchCities = async (xmlUrl: string): Promise<City[]> => {
	try {
		const response = await window.fetch(xmlUrl);
		if (!response.ok) {
			throw new Error('都市データの取得に失敗しました');
		}
		const text = await response.text();
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(text, 'text/xml');

		// すべてのpref要素を取得
		const prefs = xmlDoc.querySelectorAll('pref');
		const cities: City[] = [];

		prefs.forEach(pref => {
			const prefTitle = pref.getAttribute('title') ?? '';
			// 各都道府県内のcity要素を取得
			const citiesInPref = pref.querySelectorAll('city');

			citiesInPref.forEach(city => {
				cities.push({
					id: city.getAttribute('id') ?? '',
					title: city.getAttribute('title') ?? '',
					pref: prefTitle,
				});
			});
		});

		return cities;
	} catch (error) {
		console.error('Failed to fetch city data:', error);
		throw new Error('都市データの取得に失敗しました');
	}
};

const openSearchDialog = async () => {
	try {
		const searchResult = await os.inputText({
			title: '都道府県を検索',
			text: '都道府県名を入力してください',
			placeholder: '例: 東京都、大阪府、神奈川県',
		});

		if (searchResult.canceled || !searchResult.result) return;

		const searchTerm = normalizePrefName(searchResult.result);
		const cities = await fetchCities(widgetProps.primaryAreaXmlUrl);

		// 正規化した都道府県名で検索
		const filteredCities = cities.filter(city =>
			normalizePrefName(city.pref).includes(searchTerm),
		);

		if (filteredCities.length === 0) {
			await os.alert({
				type: 'error',
				title: 'エラー',
				text: '該当する都道府県が見つかりませんでした。\n別の都道府県名で検索してください。',
			});
			return;
		}

		// 都市を地域名でソート
		const sortedCities = filteredCities.sort((a, b) => a.title.localeCompare(b.title, 'ja'));

		const cityOptions = sortedCities.map(city => ({
			value: city.id,
			text: `${city.title} (${city.pref})`,
		}));

		const result = await os.select({
			title: '都市を選択',
			text: `${filteredCities.length}件の都市が見つかりました`,
			default: cityOptions[0].value,
			items: cityOptions,
		});

		if (!result.canceled && result.result) {
			widgetProps.cityId = result.result;
			await fetchWeatherData();
		}
	} catch (error) {
		await os.alert({
			type: 'error',
			title: 'エラー',
			text: error instanceof Error ? error.message : '予期せぬエラーが発生しました',
		});
	}
};

watch(() => widgetProps.refreshIntervalSec, setupAutoRefresh, { immediate: true });
watch(() => widgetProps.cityId, fetchWeatherData, { immediate: true });

onBeforeUnmount(() => {
	if (intervalId.value) window.clearInterval(intervalId.value);
});

onMounted(() => {
	fetchWeatherData();
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
.weather-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 8px;
	color: var(--MI_THEME-fg);
}

.weather-days {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	width: 100%;
	gap: 8px;
}

.weather-day {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	flex: 1;
	padding: 8px;
	border-right: 1px solid var(--MI_THEME-divider);
}

.weather-day:last-child {
	border-right: none;
}

.weather-date {
	font-size: 12px;
	text-align: center;
}

.weather-icon {
	width: 40px;
	height: 40px;
}

.weather-temp {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 4px;
}

.temp-max {
	font-size: 14px;
	font-weight: bold;
	color: #f04715;
}

.temp-min {
	font-size: 12px;
	color: #0988e6;
}

.weather-pop {
	font-size: 10px;
	text-align: center;
	opacity: 0.8;
}

.weather-update-time {
	font-size: 10px;
	color: var(--MI_THEME-fg);
	margin-top: 8px;
	text-align: center;
}

.copyright-link {
	color: var(--MI_THEME-fg);
	opacity: 0.7;
	text-decoration: none;
	&:hover {
		text-decoration: underline;
	}
}
</style>
