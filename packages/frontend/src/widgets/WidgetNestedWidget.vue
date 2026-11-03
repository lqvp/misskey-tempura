<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-nested-widget">
	<template #icon>
		<i class="ti ti-layers-linked"></i>
	</template>
	<template #header>
		{{ widgetProps.customTitle || i18n.ts._widgets.nestedWidget }}
	</template>
	<template #func="{ buttonStyleClass }">
		<button v-if="hasWidgets" class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.goBack" @click="prev">
			<i class="ti ti-chevron-left"></i>
		</button>
		<button v-if="hasWidgets" class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.next" @click="next">
			<i class="ti ti-chevron-right"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.settings" @click="configure">
			<i class="ti ti-settings"></i>
		</button>
	</template>

	<div :class="$style.container">
		<div v-if="!hasWidgets" :class="$style.intro">
			<MkResult type="empty" :text="i18n.ts.nothing"/>
			<MkButton @click="configure"><i class="ti ti-settings"></i> {{ i18n.ts.settings }}</MkButton>
		</div>
		<div v-else>
			<div :class="$style.wrapper" :style="wrapperStyle">
				<component
					:is="`widget-${currentWidget?.name}`"
					v-if="currentWidget?.name"
					:key="currentWidget.id"
					:widget="currentWidget"
					:onUpdateProps="childUpdater(currentWidget.id)"
				/>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue';
import { createVisibilityAwareInterval } from '@@/js/interval.js';
import { widgetPreviewContext } from './widget-preview.js';
import { getNestedWidgetRotationDelay, updateNestedWidget } from './nested-widget.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import type { WidgetName } from '@/widgets/index.js';
import MkContainer from '@/components/MkContainer.vue';
import MkButton from '@/components/MkButton.vue';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';

const name = 'nestedWidget' as const;

const widgetPropsDef = {
	showHeader: { type: 'boolean' as const, label: i18n.ts._widgetOptions.showHeader, default: true },
	customTitle: { type: 'string' as const, label: i18n.ts.title, default: '' },
	interval: { type: 'number' as const, label: i18n.ts._widgetOptions._nestedWidget.interval, description: i18n.ts._widgetOptions._nestedWidget.intervalDescription, step: 0.5, default: 10 },
	maxHeight: { type: 'number' as const, label: i18n.ts._widgetOptions._nestedWidget.maxHeight, default: 0, description: i18n.ts._widgetOptions._nestedWidget.maxHeightDescription },
	widgets: {
		type: 'array' as const,
		default: [] as Array<{ id: string; name: WidgetName; data: Record<string, any> }>,
		hidden: true,
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const wrapperStyle = computed(() => {
	if (widgetProps.maxHeight > 0) {
		return {
			height: 'auto',
			maxHeight: `${widgetProps.maxHeight}px`,
			overflowY: 'auto' as const,
		};
	}
	return {};
});

const currentIndex = ref(0);
const preview = inject(widgetPreviewContext, undefined);
const currentWidget = computed(() => {
	const widget = widgetProps.widgets[currentIndex.value];
	return widget as { id: string; name: WidgetName; data: Record<string, any> } | null;
});

const hasWidgets = computed(() => widgetProps.widgets.length > 0);

let stopInterval: (() => void) | undefined;
let mounted = false;

function resetInterval() {
	stopInterval?.();
	stopInterval = undefined;
	const delay = getNestedWidgetRotationDelay(widgetProps.interval);
	if (!mounted || preview || delay === null || widgetProps.widgets.length < 2) return;
	stopInterval = createVisibilityAwareInterval(() => {
		currentIndex.value = (currentIndex.value + 1) % widgetProps.widgets.length;
	}, delay);
}

function next() {
	if (!hasWidgets.value) return;
	currentIndex.value = (currentIndex.value + 1) % widgetProps.widgets.length;
	resetInterval();
}

function prev() {
	if (!hasWidgets.value) return;
	currentIndex.value = (currentIndex.value - 1 + widgetProps.widgets.length) % widgetProps.widgets.length;
	resetInterval();
}

function childUpdater(id: string) {
	return (data: Record<string, any>) => {
		widgetProps.widgets = updateNestedWidget(widgetProps.widgets, id, data);
		save();
	};
}

onMounted(() => { mounted = true; resetInterval(); });
onBeforeUnmount(() => stopInterval?.());
onActivated(() => { mounted = true; resetInterval(); });
onDeactivated(() => { mounted = false; stopInterval?.(); });
watch(() => [widgetProps.interval, widgetProps.widgets], () => {
	currentIndex.value = Math.max(0, Math.min(currentIndex.value, widgetProps.widgets.length - 1));
	resetInterval();
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
/* コンテナレイアウト */
.container {
	position: relative;
	height: 100%;
}

.wrapper {
	position: relative;
	height: 100%;
	overflow: hidden;
}

.intro {
	padding: 24px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

</style>
