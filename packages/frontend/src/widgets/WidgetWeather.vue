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
					<img :src="forecast.iconUrl" :alt="forecast.summary" class="weather-icon" loading="lazy"/>
					<div class="weather-summary">{{ forecast.summary }}</div>
					<div class="weather-temp">
						<span class="temp-max">{{ getMaxTemp(forecast) }}°C</span>
						<span class="temp-separator"> / </span>
						<span class="temp-min">{{ getMinTemp(forecast) }}°C</span>
					</div>
				</div>
			</div>
			<div v-if="widgetProps.showFooterInfo" class="weather-update-time">
				{{ formattedFooter }}<br>
				<a v-if="attribution" :href="attribution.link" target="_blank" class="copyright-link">{{ attribution.title }}</a>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, onBeforeUnmount, watch, computed } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_ICON_BASE = 'https://cdn.meteocons.com/3.0.0-next.10/svg/fill'; // Meteocons by Bas Milius (MIT)
const MAX_FORECAST_DAYS = 3;

const name = 'weather' as const;

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: true,
	},
	latitude: {
		type: 'number' as const,
		default: 35.6895,
		description: '観測地点の緯度 (度)',
	},
	longitude: {
		type: 'number' as const,
		default: 139.6917,
		description: '観測地点の経度 (度)',
	},
	locationName: {
		type: 'string' as const,
		default: 'Tokyo, JP',
		description: '表示用のロケーション名',
	},
	geocodingLanguage: {
		type: 'string' as const,
		default: 'ja',
		description: 'ロケーション検索で使用する言語 (ISO 639-1)',
	},
	searchResultLimit: {
		type: 'number' as const,
		default: 10,
		description: '検索候補として表示する件数 (最大20程度を推奨)',
	},
	weatherModel: {
		type: 'string' as const,
		default: 'jma_seamless',
		description: 'Open-Meteoのmodelsパラメータ (例: jma_seamless)',
	},
	forecastDays: {
		type: 'number' as const,
		default: MAX_FORECAST_DAYS,
		description: '取得する予報日数 (1-3)',
	},
	refreshIntervalSec: {
		type: 'number' as const,
		default: 3600,
	},
	showFooterInfo: {
		type: 'boolean' as const,
		default: true,
	},
	footerFormat: {
		type: 'string' as const,
		default: '{locationName} | {timezoneAbbreviation} | {updateTime}',
		description: '利用可能なプレースホルダー: {locationName}, {latitude}, {longitude}, {timezone}, {timezoneAbbreviation}, {updateTime}, {source}',
		multiline: true,
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

interface WeatherApiResponse {
	latitude: number;
	longitude: number;
	timezone: string;
	timezone_abbreviation: string;
	elevation: number;
	daily_units: {
		time: string;
		weathercode: string;
		temperature_2m_max: string;
		temperature_2m_min: string;
	};
	daily: {
		time: string[];
		weathercode: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
	};
}

interface ProcessedForecast {
	date: string;
	dateLabel: string;
	summary: string;
	iconUrl: string;
	temperatureMax: number | null;
	temperatureMin: number | null;
	weatherCode: number;
}

interface GeocodingResult {
	id?: number;
	name: string;
	latitude: number;
	longitude: number;
	timezone?: string;
	admin1?: string;
	admin2?: string;
	country?: string;
	country_code?: string;
}

interface WeatherCodeInfo {
	summary: string;
	icon: string;
}

interface SelectedLocation {
	latitude: number;
	longitude: number;
	label: string;
}

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const fetching = ref(true);
const weatherData = ref<WeatherApiResponse | null>(null);
const updateTime = ref('');
const intervalId = ref<number | null>(null);
const attribution = Object.freeze({
	title: 'Open-Meteo.com',
	link: 'https://open-meteo.com/',
});

const clampForecastDays = (value: number) => {
	const safeValue = Number.isFinite(value) ? Math.round(value) : widgetPropsDef.forecastDays.default;
	return Math.min(Math.max(safeValue, 1), MAX_FORECAST_DAYS);
};

const weatherCodeMapping = computed<Record<number, WeatherCodeInfo>>(() => ({
	0: { summary: i18n.ts._weatherWidgets.summaries.clearSky, icon: 'clear-day' },
	1: { summary: i18n.ts._weatherWidgets.summaries.mainlyClear, icon: 'partly-cloudy-day' },
	2: { summary: i18n.ts._weatherWidgets.summaries.partlyCloudy, icon: 'partly-cloudy-day' },
	3: { summary: i18n.ts._weatherWidgets.summaries.overcast, icon: 'overcast' },
	45: { summary: i18n.ts._weatherWidgets.summaries.fog, icon: 'fog' },
	48: { summary: i18n.ts._weatherWidgets.summaries.depositingRimeFog, icon: 'fog' },
	51: { summary: i18n.ts._weatherWidgets.summaries.lightDrizzle, icon: 'drizzle' },
	53: { summary: i18n.ts._weatherWidgets.summaries.moderateDrizzle, icon: 'drizzle' },
	55: { summary: i18n.ts._weatherWidgets.summaries.denseDrizzle, icon: 'drizzle' },
	56: { summary: i18n.ts._weatherWidgets.summaries.freezingDrizzle, icon: 'sleet' },
	57: { summary: i18n.ts._weatherWidgets.summaries.freezingDrizzle, icon: 'sleet' },
	61: { summary: i18n.ts._weatherWidgets.summaries.slightRain, icon: 'rain' },
	63: { summary: i18n.ts._weatherWidgets.summaries.moderateRain, icon: 'rain' },
	65: { summary: i18n.ts._weatherWidgets.summaries.heavyRain, icon: 'rain' },
	66: { summary: i18n.ts._weatherWidgets.summaries.lightFreezingRain, icon: 'sleet' },
	67: { summary: i18n.ts._weatherWidgets.summaries.heavyFreezingRain, icon: 'sleet' },
	71: { summary: i18n.ts._weatherWidgets.summaries.slightSnowFall, icon: 'snow' },
	73: { summary: i18n.ts._weatherWidgets.summaries.moderateSnowFall, icon: 'snow' },
	75: { summary: i18n.ts._weatherWidgets.summaries.heavySnowFall, icon: 'snow' },
	77: { summary: i18n.ts._weatherWidgets.summaries.snowGrains, icon: 'snow' },
	80: { summary: i18n.ts._weatherWidgets.summaries.slightRainShowers, icon: 'rain' },
	81: { summary: i18n.ts._weatherWidgets.summaries.moderateRainShowers, icon: 'rain' },
	82: { summary: i18n.ts._weatherWidgets.summaries.violentRainShowers, icon: 'rain' },
	85: { summary: i18n.ts._weatherWidgets.summaries.snowShowers, icon: 'snow' },
	86: { summary: i18n.ts._weatherWidgets.summaries.heavySnowShowers, icon: 'snow' },
	95: { summary: i18n.ts._weatherWidgets.summaries.thunderstorm, icon: 'thunderstorms' },
	96: { summary: i18n.ts._weatherWidgets.summaries.thunderstormWithHail, icon: 'thunderstorms' },
	99: { summary: i18n.ts._weatherWidgets.summaries.severeThunderstormWithHail, icon: 'thunderstorms' },
}));

const defaultWeatherInfo: WeatherCodeInfo = { summary: 'Unknown', icon: 'overcast' };

const getWeatherCodeInfo = (code: number): WeatherCodeInfo => {
	return weatherCodeMapping.value[code] ?? defaultWeatherInfo;
};

const buildIconUrl = (icon: string) => `${WEATHER_ICON_BASE}/${icon}.svg`;

const toUtcDate = (dateString: string) => {
	const parts = dateString.split('-');
	if (parts.length !== 3) return null;
	const [yearStr, monthStr, dayStr] = parts;
	const year = Number.parseInt(yearStr, 10);
	const month = Number.parseInt(monthStr, 10);
	const day = Number.parseInt(dayStr, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
	return new Date(Date.UTC(year, month - 1, day));
};

const formatWeekdayLabel = (dateString: string, timeZone?: string) => {
	const date = toUtcDate(dateString);
	if (!date) return '';
	const options: Intl.DateTimeFormatOptions = { weekday: 'short' };
	if (timeZone) options.timeZone = timeZone;
	return new Intl.DateTimeFormat(undefined, options).format(date);
};

const locationLabel = computed(() => {
	const trimmedLocationName = widgetProps.locationName?.trim() ?? '';
	if (trimmedLocationName.length > 0) return trimmedLocationName;
	const lat = Number.isFinite(widgetProps.latitude) ? widgetProps.latitude.toFixed(2) : '';
	const lon = Number.isFinite(widgetProps.longitude) ? widgetProps.longitude.toFixed(2) : '';
	return lat && lon ? `${lat}, ${lon}` : '';
});

const forecasts = computed<ProcessedForecast[]>(() => {
	const data = weatherData.value;
	if (!data?.daily) return [];

	const { time, weathercode, temperature_2m_max, temperature_2m_min } = data.daily;
	const timeZone = data.timezone;

	return time.map((date, index) => {
		const info = getWeatherCodeInfo(weathercode[index]);
		return {
			date,
			dateLabel: formatWeekdayLabel(date, timeZone),
			summary: info.summary,
			iconUrl: buildIconUrl(info.icon),
			temperatureMax: temperature_2m_max[index] ?? null,
			temperatureMin: temperature_2m_min[index] ?? null,
			weatherCode: weathercode[index],
		};
	});
});

const formattedFooter = computed(() => {
	const data = weatherData.value;
	if (!data) return '';

	const replacements: Record<string, string> = {
		'{location}': locationLabel.value,
		'{locationName}': locationLabel.value,
		'{latitude}': Number.isFinite(widgetProps.latitude) ? widgetProps.latitude.toFixed(2) : '',
		'{longitude}': Number.isFinite(widgetProps.longitude) ? widgetProps.longitude.toFixed(2) : '',
		'{timezone}': data.timezone,
		'{timezoneAbbreviation}': data.timezone_abbreviation,
		'{updateTime}': updateTime.value,
		'{source}': attribution.title,
	};

	return widgetProps.footerFormat.replace(
		/\{[^}]+\}/g,
		(match) => replacements[match] ?? match,
	);
});

const fetchWeatherData = async () => {
	const { latitude: lat, longitude: lon } = widgetProps;

	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
		console.warn('緯度・経度が不正です');
		await os.alert({
			type: 'error',
			title: 'エラー',
			text: '緯度・経度が不正です。設定を確認してください。',
		});
		fetching.value = false;
		return;
	}

	fetching.value = true;
	try {
		const params = new URLSearchParams({
			latitude: lat.toString(),
			longitude: lon.toString(),
			timezone: 'auto',
			daily: 'weathercode,temperature_2m_max,temperature_2m_min',
			forecast_days: clampForecastDays(widgetProps.forecastDays).toString(),
		});
		const selectedModel = widgetProps.weatherModel?.trim();
		if (selectedModel) {
			params.set('models', selectedModel);
		}

		const response = await window.fetch(`${OPEN_METEO_API}?${params.toString()}`);
		if (!response.ok) {
			throw new Error('天気データの取得に失敗しました');
		}
		const data: WeatherApiResponse = await response.json();
		weatherData.value = data;
		updateTime.value = new Date().toLocaleString();
	} catch (error) {
		console.error('Failed to fetch weather data:', error);
		// await os.alert({
		// 	type: 'error',
		// 	title: 'エラー',
		// 	text: error instanceof Error ? error.message : '予期せぬエラーが発生しました',
		// });
	} finally {
		fetching.value = false;
	}
};

const refreshWeatherData = () => {
	void fetchWeatherData();
};

const formatDate = (dateString: string) => {
	const date = toUtcDate(dateString);
	if (!date) return dateString;
	return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

const formatTemperature = (value: number | null) => {
	if (value === null || Number.isNaN(value)) return '--';
	return Math.round(value).toString();
};

const getMaxTemp = (forecast: ProcessedForecast) => {
	return formatTemperature(forecast.temperatureMax);
};

const getMinTemp = (forecast: ProcessedForecast) => {
	return formatTemperature(forecast.temperatureMin);
};

const searchLocations = async (query: string): Promise<GeocodingResult[]> => {
	const limit = Math.max(1, Math.min(50, Math.round(widgetProps.searchResultLimit)));
	const params = new URLSearchParams({
		name: query,
		language: (widgetProps.geocodingLanguage || widgetPropsDef.geocodingLanguage.default).trim(),
		count: limit.toString(),
	});
	const response = await window.fetch(`${OPEN_METEO_GEOCODING_API}?${params.toString()}`);
	if (!response.ok) {
		throw new Error('ロケーション検索に失敗しました');
	}
	const data = await response.json();
	return data.results ?? [];
};

const buildLocationLabel = (location: GeocodingResult) => {
	const parts = [location.name];
	if (location.admin1 && location.admin1 !== location.name) parts.push(location.admin1);
	if (location.country) parts.push(location.country);
	return parts.filter(Boolean).join(', ');
};

const openSearchDialog = async () => {
	try {
		const searchResult = await os.inputText({
			title: 'ロケーションを検索',
			text: '都市名や地域名を入力してください',
			placeholder: '例: Tokyo, Osaka, San Francisco',
		});

		if (searchResult.canceled || !searchResult.result) return;

		const query = searchResult.result.trim();
		const locations = await searchLocations(query);

		if (locations.length === 0) {
			await os.alert({
				type: 'error',
				title: '該当なし',
				text: '該当するロケーションが見つかりませんでした。\n別のキーワードを試してください。',
			});
			return;
		}

		const options = locations.map(location => {
			const label = buildLocationLabel(location);
			const value: SelectedLocation = {
				latitude: location.latitude,
				longitude: location.longitude,
				label,
			};
			return {
				value: JSON.stringify(value),
				label: `${label} (${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)})`,
			};
		});

		const result = await os.select({
			title: 'ロケーションを選択',
			text: `${locations.length}件の候補が見つかりました`,
			default: options[0].value,
			items: options,
		});

		if (result.canceled || !result.result) return;

		const parsed = JSON.parse(result.result) as SelectedLocation;
		widgetProps.latitude = parsed.latitude;
		widgetProps.longitude = parsed.longitude;
		widgetProps.locationName = parsed.label;

		await fetchWeatherData();
	} catch (error) {
		await os.alert({
			type: 'error',
			title: 'エラー',
			text: error instanceof Error ? error.message : '予期せぬエラーが発生しました',
		});
	}
};

const setupAutoRefresh = () => {
	if (intervalId.value) {
		window.clearInterval(intervalId.value);
		intervalId.value = null;
	}
	if (widgetProps.refreshIntervalSec > 0) {
		intervalId.value = window.setInterval(() => {
			void fetchWeatherData();
		}, widgetProps.refreshIntervalSec * 1000);
	}
};

watch(() => widgetProps.refreshIntervalSec, setupAutoRefresh, { immediate: true });
watch(
	() => [widgetProps.latitude, widgetProps.longitude, widgetProps.forecastDays, widgetProps.weatherModel],
	() => {
		void fetchWeatherData();
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	if (intervalId.value) window.clearInterval(intervalId.value);
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

.weather-summary {
	font-size: 12px;
	text-align: center;
	opacity: 0.85;
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

.weather-update-time {
	font-size: 0.8em;
	opacity: 0.9;
	text-align: center;
	margin-top: 4px;
	white-space: pre-wrap;
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
