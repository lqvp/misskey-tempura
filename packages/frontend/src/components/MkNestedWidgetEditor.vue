<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div :class="$style.heading">{{ i18n.ts._widgetOptions._nestedWidget.children }}</div>
	<MkButton @click="add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
	<MkResult v-if="widgets.length === 0" type="empty" :text="i18n.ts.nothing"/>
	<div v-for="(widget, index) in widgets" :key="widget.id" :class="$style.row">
		<MkButton :class="$style.name" @click="emit('edit', widget.id)">{{ widgetLabel(widget) }} <i class="ti ti-settings"></i></MkButton>
		<div :class="$style.actions">
			<MkButton :disabled="index === 0" :aria-label="i18n.ts._widgetOptions._nestedWidget.moveUp" @click="move(widget.id, -1)"><i class="ti ti-arrow-up"></i></MkButton>
			<MkButton :disabled="index === widgets.length - 1" :aria-label="i18n.ts._widgetOptions._nestedWidget.moveDown" @click="move(widget.id, 1)"><i class="ti ti-arrow-down"></i></MkButton>
			<MkButton danger :aria-label="i18n.ts.delete" @click="remove(widget.id)"><i class="ti ti-trash"></i></MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetName } from '@/widgets/index.js';
import type { NestedWidget } from '@/widgets/nested-widget.js';
import MkButton from '@/components/MkButton.vue';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { federationWidgets, widgets as widgetNames } from '@/widgets/index.js';
import { moveNestedWidget } from '@/widgets/nested-widget.js';
import { buildWidgetSelectItems } from '@/widgets/widget-select-items.js';

const widgets = defineModel<NestedWidget[]>({ required: true });
const emit = defineEmits<{ (ev: 'edit', id: string): void }>();

const availableWidgetNames = computed(() => (
	instance.federation === 'none'
		? widgetNames.filter(widgetName => !(federationWidgets as readonly WidgetName[]).includes(widgetName))
		: widgetNames
));

function widgetLabel(widget: NestedWidget) {
	return i18n.ts._widgets[widget.name as WidgetName] ?? widget.name;
}

async function add() {
	const { canceled, result } = await os.select({
		title: i18n.ts.selectWidget,
		items: buildWidgetSelectItems({
			widgetNames: availableWidgetNames.value,
			getLabel: widgetName => i18n.ts._widgets[widgetName],
			originalFeatureLabel: i18n.ts.originalFeature,
		}),
	});
	if (canceled || !result) return;
	const widget = { id: crypto.randomUUID(), name: String(result), data: {} };
	widgets.value = [...widgets.value, widget];
	emit('edit', widget.id);
}

function move(id: string, offset: number) {
	widgets.value = moveNestedWidget(widgets.value, id, offset);
}

async function remove(id: string) {
	const widget = widgets.value.find(item => item.id === id);
	if (!widget) return;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx.deleteAreYouSure({ x: widgetLabel(widget) }) });
	if (!canceled) widgets.value = widgets.value.filter(item => item.id !== id);
}
</script>

<style lang="scss" module>
.heading { font-weight: bold; }
.row { padding: var(--MI-marginHalf); border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
.name { width: 100%; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
</style>
