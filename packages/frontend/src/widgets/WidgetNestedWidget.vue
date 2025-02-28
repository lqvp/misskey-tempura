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
		<button class="_button" :class="buttonStyleClass" @click="prev">
			<i class="ti ti-chevron-left"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="next">
			<i class="ti ti-chevron-right"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="addWidget">
			<i class="ti ti-plus"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="removeWidget(currentIndex)">
			<i class="ti ti-trash"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="toggleEditMode">
			<i class="ti ti-pencil"></i>
		</button>
	</template>

	<div :class="$style.container">
		<div v-if="!hasWidgets" class="intro" style="text-align: center;">
			<img :src="infoImageUrl" :class="$style.ghostImage"/>
			<div>{{ i18n.ts.nothing }}</div>
		</div>
		<div v-else>
			<div v-if="editMode" :class="$style.editModeContainer">
				<Sortable
					v-model="widgetProps.widgets"
					itemKey="id"
					handle=".handle"
					:animation="150"
					:class="$style.sortableList"
					@update:modelValue="save"
				>
					<template #item="{ element, index }">
						<div :class="$style.sortableItem">
							<span :class="[$style.itemHandle, 'handle']">
								<i class="ti ti-grip-vertical"></i>
							</span>
							<span :class="$style.itemTitle">{{ i18n.ts._widgets[element.name] }}</span>
							<button :class="[$style.actionButton, $style.deleteButton]" @click.stop="removeWidget(index)">
								<i class="ti ti-trash"></i>
							</button>
						</div>
					</template>
				</Sortable>
				<button :class="$style.doneButton" @click="toggleEditMode">
					<i class="ti ti-check"></i> {{ i18n.ts.close }}
				</button>
			</div>
			<div v-else :class="$style.wrapper">
				<component
					:is="`widget-${currentWidget.name}`"
					v-if="currentWidget && currentWidget.name"
					:key="currentWidget.id"
					:widget="currentWidget"
					@updateProps="updateChildProps"
				/>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import Sortable from 'vuedraggable';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/scripts/form.js';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import { infoImageUrl } from '@/instance.js';
import * as os from '@/os.js';
import { widgets as widgetDefs } from '@/widgets/index.js';

const name = i18n.ts._widgets.nestedWidget;

const widgetPropsDef = {
	showHeader: { type: 'boolean' as const, default: true },
	customTitle: { type: 'string' as const, default: '' },
	interval: { type: 'number' as const, default: 10 },
	widgets: {
		type: 'array' as const,
		default: [] as Array<{ id: string; name: string; data: Record<string, any> }>,
	},
};

	type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const currentIndex = ref(0);
const autoRotate = ref(true);
const editMode = ref(false);

const currentWidget = computed(() => widgetProps.widgets[currentIndex.value] || null);
const hasWidgets = computed(() => widgetProps.widgets.length > 0);

const next = () => {
	const length = widgetProps.widgets.length;
	if (length === 0) return;
	currentIndex.value = (currentIndex.value + 1) % length;
};

const prev = () => {
	const length = widgetProps.widgets.length;
	if (length === 0) return;
	currentIndex.value = (currentIndex.value - 1 + length) % length;
};

const addWidget = async () => {
	try {
		const { canceled, result: widgetName } = await os.select({
			title: i18n.ts.selectWidget,
			items: widgetDefs.map(w => ({
				value: w,
				text: i18n.ts._widgets[w],
			})),
		});
		if (canceled || !widgetName) return;

		const newWidget = {
			id: crypto.randomUUID(),
			name: widgetName,
			data: {},
		};

		widgetProps.widgets = [...widgetProps.widgets, newWidget];
		currentIndex.value = widgetProps.widgets.length - 1;
		save();
	} catch (error) {
		os.alert('Widget の選択中にエラーが発生しました:', error);
	}
};

const removeWidget = (index: number) => {
	widgetProps.widgets = widgetProps.widgets.filter((_, i) => i !== index);
	currentIndex.value = Math.min(currentIndex.value, widgetProps.widgets.length - 1);
	save();
};

const updateChildProps = (data: Record<string, any>) => {
	const widget = widgetProps.widgets[currentIndex.value];
	widgetProps.widgets.splice(currentIndex.value, 1, { ...widget, data });
	save();
};

const toggleEditMode = () => {
	editMode.value = !editMode.value;
};

const delay = computed(() => {
	return widgetProps.interval === 0 ? 1000 : widgetProps.interval * 1000;
});

const setupInterval = (intervalDelay: number, afterMounted: boolean) => {
	stopInterval && stopInterval();
	stopInterval = useInterval(() => {
		if (widgetProps.interval === 0) return;
		if (autoRotate.value && hasWidgets.value) {
			next();
		}
	}, intervalDelay, {
		immediate: false,
		afterMounted,
	});
};

let stopInterval = useInterval(() => {
	if (widgetProps.interval === 0) return;
	if (autoRotate.value && hasWidgets.value) {
		next();
	}
}, delay.value, {
	immediate: false,
	afterMounted: true,
});

watch(delay, (newDelay) => {
	setupInterval(newDelay, false);
});

watch(() => widgetProps.widgets, () => {
	currentIndex.value = Math.min(currentIndex.value, widgetProps.widgets.length - 1);
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
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
	padding: 16px;
	text-align: center;
	color: var(--MI_THEME-fg);
}

.ghostImage {
    max-width: 100%;
    max-height: 100px;
}

.editModeContainer {
	background: var(--MI_THEME-panel);
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	margin-bottom: 12px;
}

.sortableList {
	max-height: calc(100% - 40px);
	overflow-y: auto;
	background: var(--MI_THEME-bg);
}

.sortableItem {
	background: var(--MI_THEME-panel);
	margin: 8px;
	display: flex;
	align-items: center;
	padding: 10px 12px;
	border-radius: 6px;
	transition: all 0.2s ease;
	border: 1px solid var(--MI_THEME-divider);

	&:hover {
		background: var(--MI_THEME-buttonHover);
		transform: translateY(-1px);
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
	}

	&:active {
		transform: translateY(0);
	}
}

.itemHandle {
	cursor: grab;
	margin-right: 12px;
	padding: 4px;
	border-radius: 4px;
	color: var(--MI_THEME-accent);

	&:hover {
		background: var(--MI_THEME-buttonHover);
	}
}

.itemTitle {
	flex: 1;
	font-size: 0.95em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.actionButton {
	padding: 6px;
	margin-left: 4px;
	border-radius: 4px;
	color: var(--MI_THEME-fg);
	background: transparent;
	transition: all 0.2s ease;

	&:hover {
		background: var(--MI_THEME-buttonHover);
		color: var(--MI_THEME-accent);
	}

	&.deleteButton:hover {
		background: var(--MI_THEME-bg);
		color: var(--MI_THEME-error);
	}
}

.doneButton {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 12px;
	padding: 8px 16px;
	border-radius: 6px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-weight: bold;
	transition: all 0.2s ease;
	width: 100%;

	&:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	&:active {
		transform: translateY(0);
	}

	i {
		margin-right: 6px;
	}
}
</style>
