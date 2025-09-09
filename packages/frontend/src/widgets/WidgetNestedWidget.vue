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
		<button v-if="hasWidgets" class="_button" :class="buttonStyleClass" @click="prev">
			<i class="ti ti-chevron-left"></i>
		</button>
		<button v-if="hasWidgets" class="_button" :class="buttonStyleClass" @click="next">
			<i class="ti ti-chevron-right"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="addWidget">
			<i class="ti ti-plus"></i>
		</button>
		<button v-if="hasWidgets" class="_button" :class="buttonStyleClass" @click="removeWidget(currentIndex)">
			<i class="ti ti-trash"></i>
		</button>
		<button class="_button" :class="buttonStyleClass" @click="toggleEditMode">
			<i class="ti ti-pencil"></i>
		</button>
	</template>

	<div :class="$style.container">
		<div v-if="!hasWidgets" :class="$style.intro">
			<MkResult type="empty" :text="i18n.ts.nothing"/>
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
							<span :class="$style.itemTitle">{{ i18n.ts._widgets[element.name] || element.name }}</span>
							<button :class="[$style.actionButton, $style.deleteButton]" @click.stop="removeWidget(index)">
								<i class="ti ti-trash"></i>
							</button>
						</div>
					</template>
				</Sortable>
				<div :class="$style.editModeFooter">
					<button :class="$style.doneButton" @click="toggleEditMode">
						<i class="ti ti-check"></i>
						{{ i18n.ts.close }}
					</button>
				</div>
			</div>
			<div v-else :class="$style.wrapper" :style="wrapperStyle">
				<component
					:is="`widget-${currentWidget?.name}`"
					v-if="currentWidget?.name"
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
import type { GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { widgets as widgetDefs } from '@/widgets/index.js';

const name = i18n.ts._widgets.nestedWidget;

const widgetPropsDef = {
	showHeader: { type: 'boolean' as const, default: true },
	customTitle: { type: 'string' as const, default: '' },
	interval: { type: 'number' as const, default: 10 },
	maxHeight: { type: 'number' as const, default: 0, description: '0 の場合は無制限' },
	widgets: {
		type: 'array' as const,
		default: [] as Array<{ id: string; name: string; data: Record<string, any> }>,
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
const autoRotate = ref(true);
const editMode = ref(false);

const currentWidget = computed(() => {
	const widget = widgetProps.widgets[currentIndex.value];
	return widget as { id: string; name: string; data: Record<string, any> } | null;
});

const hasWidgets = computed(() => widgetProps.widgets.length > 0);

const delay = computed(() => {
	return widgetProps.interval === 0 ? 1000 : widgetProps.interval * 1000;
});

// インターバル管理
let stopInterval: (() => void) | null | undefined = null;

const resetInterval = () => {
	if (stopInterval) stopInterval();
	if (widgetProps.interval === 0 || editMode.value) return;

	stopInterval = useInterval(() => {
		if (autoRotate.value && hasWidgets.value) {
			next();
		}
	}, delay.value, {
		immediate: false,
		afterMounted: true,
	});
};

const next = () => {
	if (!hasWidgets.value) return;
	const length = widgetProps.widgets.length;
	currentIndex.value = (currentIndex.value + 1) % length;
	resetInterval(); // タイマーをリセット
};

const prev = () => {
	if (!hasWidgets.value) return;
	const length = widgetProps.widgets.length;
	currentIndex.value = (currentIndex.value - 1 + length) % length;
	resetInterval(); // タイマーをリセット
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
		os.alert({
			type: 'error',
			text: `Widget の選択中にエラーが発生しました: ${error}`,
		});
	}
};

const removeWidget = (index: number) => {
	if (widgetProps.widgets.length === 0) return;

	widgetProps.widgets = widgetProps.widgets.filter((_, i) => i !== index);
	currentIndex.value = Math.min(currentIndex.value, widgetProps.widgets.length - 1);
	save();
};

const updateChildProps = (data: Record<string, any>) => {
	const widget = widgetProps.widgets[currentIndex.value];
	if (!widget) return;

	const updatedWidget = { ...widget, data };
	widgetProps.widgets.splice(currentIndex.value, 1, updatedWidget);
	save();
};

const toggleEditMode = () => {
	editMode.value = !editMode.value;
	if (editMode.value) {
		// 編集モードに入る時はインターバルを停止
		if (stopInterval) stopInterval();
	} else {
		// 編集モードから出る時はインターバルを再開
		resetInterval();
	}
};

// 初期化とwatch
resetInterval();

watch(delay, () => {
	resetInterval();
});

watch(editMode, () => {
	if (editMode.value) {
		if (stopInterval) stopInterval();
	} else {
		resetInterval();
	}
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

/* 編集モード */
.editModeContainer {
	background: var(--MI_THEME-panel);
	border-radius: 6px;
	overflow: hidden;
	border: 1px solid var(--MI_THEME-divider);
	margin: var(--MI-margin) 0;
}

.editModeFooter {
	padding: 12px;
	border-top: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panelHeaderBg);
	text-align: center;
}

/* ソート可能リスト */
.sortableList {
	min-height: 100px;
	max-height: 400px;
	overflow-y: auto;
	background: var(--MI_THEME-bg);
	padding: 8px;
}

.sortableItem {
	background: var(--MI_THEME-panel);
	margin-bottom: 8px;
	display: flex;
	align-items: center;
	padding: 12px;
	border-radius: 4px;
	transition: background 0.1s ease;
	border: 1px solid var(--MI_THEME-divider);
	position: relative;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:last-child {
		margin-bottom: 0;
	}
}

/* ドラッグハンドル */
.itemHandle {
	cursor: grab;
	margin-right: 12px;
	padding: 8px;
	border-radius: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: all 0.1s ease;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-buttonBg);
	border: 1px solid var(--MI_THEME-divider);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-accent);
		border-color: var(--MI_THEME-accent);
	}

	&:active {
		cursor: grabbing;
		background: var(--MI_THEME-buttonHoverBg);
	}
}

/* アイテムタイトル */
.itemTitle {
	flex: 1;
	font-size: 0.9em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fg);
}

/* アクションボタン */
.actionButton {
	position: absolute;
	top: 50%;
	right: 8px;
	transform: translateY(-50%);
	width: 32px;
	height: 32px;
	color: var(--MI_THEME-fgOnAccent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);
	border-radius: 4px;
	border: none !important;
	outline: none !important;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.1s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 80%, transparent);
	}

		&.deleteButton {
		background: color-mix(in srgb, var(--MI_THEME-error) 70%, transparent);
		color: var(--MI_THEME-fgOnAccent);

		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-error) 80%, transparent);
		}
	}
}

/* ボタンスタイル */
.doneButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 7px 14px;
	border-radius: 5px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-weight: normal;
	font-size: 95%;
	transition: background 0.1s ease;
	min-width: 100px;
	border: none !important;
	outline: none !important;

	&:hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
	}

	&:active {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
	}

	i {
		margin-right: 6px;
	}
}

/* ヘッダータイトル */
.headerTitle {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: calc(100% - 210px);
}
</style>

