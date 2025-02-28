<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-earthQuake">
	<template #icon><i class="ti ti-alert-square"></i></template>
	<template #header>{{ i18n.ts._widgets.earthQuake }}</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="reload"><i class="ti ti-reload"></i> </button>
		<button class="_button" :class="buttonStyleClass" @click="configure"><i class="ti ti-settings"></i></button>
	</template>

	<div :class="$style.root">
		<MkLoading v-if="loading"/>
		<div v-else :class="$style.iframeContainer" :style="iframeContainerStyle">
			<iframe
				:src="currentUrl"
				:class="$style.earthquakeIframe"
				frameborder="0"
				scrolling="no"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			></iframe>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/scripts/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';

const name = i18n.ts._widgets.earthQuake;

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: true,
	},
	style: {
		type: 'enum' as const,
		default: 'default' as const,
		enum: [
			{ label: 'Default', value: 'default' as const },
			{ label: 'Compact', value: 'compact' as const },
			{ label: 'Multiple', value: 'multiple' as const },
			{ label: 'WebSocket', value: 'webSocket' as const },
			{ label: 'Kmoni', value: 'kmoni' as const },
		],
	},
	width: {
		type: 'number' as const,
		default: 100,
	},
	height: {
		type: 'number' as const,
		default: 400,
	},
	contentScale: {
		type: 'number' as const,
		default: 100,
		description: 'コンテンツの表示倍率（%）',
	},
	refreshInterval: {
		type: 'number' as const,
		default: 0,
		description: '自動更新間隔（秒）（0 = 無効）',
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const loading = ref(true);
let refreshTimer: any = null;

const urlMap = {
	default: 'https://eqdata.sakura.ne.jp/kyoshin/2sec_t.html',
	compact: 'https://kwatch-24h.net/2sec_alm_i.html',
	multiple: 'https://kwatch-24h.net/2sec_alm_multi.html',
	webSocket: 'https://eqdata.sakura.ne.jp/kyoshin/ws/2moni/2sec_alm_2monitw.html',
	kmoni: 'http://www.kmoni.bosai.go.jp/',
};

const currentUrl = computed(() => {
	return urlMap[widgetProps.style] || urlMap.default;
});

const setupRefreshTimer = () => {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}

	if (widgetProps.refreshInterval > 0) {
		refreshTimer = setInterval(() => {
			reloadIframe();
		}, widgetProps.refreshInterval * 1000);
	}
};

const reloadIframe = () => {
	loading.value = true;
	setTimeout(() => {
		const iframe = document.querySelector('.earthquakeIframe') as HTMLIFrameElement;
		if (iframe) {
			const originalSrc = iframe.src.split('?')[0];
			iframe.src = `${originalSrc}?t=${new Date().getTime()}`;
		}
		loading.value = false;
	}, 500);
};

const reload = () => {
	reloadIframe();
};

watch(() => widgetProps.style, () => {
	loading.value = true;
	setTimeout(() => loading.value = false, 1000);
});

watch(() => widgetProps.refreshInterval, setupRefreshTimer);

onMounted(() => {
	setupRefreshTimer();
	setTimeout(() => loading.value = false, 1500);
});

onUnmounted(() => {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});

const iframeContainerStyle = computed(() => {
	const scale = widgetProps.contentScale / 100;
	return {
		transform: `scale(${scale})`,
		transformOrigin: 'top left',
	};
});
</script>

<style lang="scss" module>
.root {
  position: relative;
  padding: 8px;
  height: 100%;
  box-sizing: border-box;
}

.iframeContainer {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	width: 100%;
	height: 100%;
	transform-style: preserve-3d;
}

.earthquakeIframe {
  width: 100%;
  height: 100%;
  border: none;
  position: relative;
  top: 0;
  left: 0;
}
</style>

