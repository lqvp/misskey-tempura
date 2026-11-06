<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="1000"
	:height="600"
	:scroll="false"
	:withOkButton="true"
	:okButtonDisabled="!canSave || !validNestedSettings"
	@close="cancel()"
	@esc="cancel()"
	@ok="save()"
	@closed="emit('closed')"
>
	<template #header><i class="ti ti-icons"></i> {{ i18n.ts._widgets[activeName] ?? activeName }}</template>

	<MkPreviewWithControls>
		<template #preview>
			<div :class="$style.previewWrapper">
				<div class="_acrylic" :class="$style.previewTitle">{{ i18n.ts.preview }}</div>

				<div ref="resizerRootEl" :class="$style.previewResizerRoot" inert>
					<div
						ref="resizerEl"
						:class="$style.previewResizer"
						:style="{ transform: widgetStyle }"
					>
						<component
							:is="`widget-${activeName}`"
							:key="activeId"
							:widget="{ name: activeName, id: activeId, data: activeSettings }"
						></component>
					</div>
				</div>
			</div>
		</template>

		<template #controls>
			<div class="_spacer _gaps_m">
				<MkButton v-if="path.length" :disabled="!canSave" @click="back"><i class="ti ti-arrow-left"></i> {{ i18n.ts._widgetOptions._nestedWidget.back }}</MkButton>
				<div v-if="activeName === 'nestedWidget'">{{ i18n.ts._widgetOptions._nestedWidget.general }}</div>
				<MkForm :key="activeId" v-model="activeSettings" :form="activeForm" @canSaveStateChange="onCanSaveStateChanged"/>
				<MkNestedWidgetEditor v-if="activeName === 'nestedWidget'" :modelValue="activeSettings.widgets ?? []" @update:modelValue="activeSettings.widgets = $event" @edit="editChild"/>
			</div>
		</template>
	</MkPreviewWithControls>
</MkModalWindow>
</template>

<script setup lang="ts">
import { useTemplateRef, ref, computed, onBeforeUnmount, onMounted, provide, shallowRef } from 'vue';
import MkPreviewWithControls from './MkPreviewWithControls.vue';
import type { Form } from '@/utility/form.js';
import type { WidgetName } from '@/widgets/index.js';
import type { NestedWidget } from '@/widgets/nested-widget.js';
import { deepClone } from '@/utility/clone.js';
import { i18n } from '@/i18n.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkForm from '@/components/MkForm.vue';
import MkButton from '@/components/MkButton.vue';
import MkNestedWidgetEditor from '@/components/MkNestedWidgetEditor.vue';
import { widgetPreviewContext } from '@/widgets/widget-preview.js';

const props = defineProps<{
	widgetName: WidgetName;
	form: Form;
	currentSettings: Record<string, any>;
}>();

const emit = defineEmits<{
	(ev: 'saved', settings: Record<string, any>): void;
	(ev: 'canceled'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const settings = ref<Record<string, any>>(deepClone(props.currentSettings));

const canSave = ref(true);
const path = ref<string[]>([]);
const childForm = shallowRef<Form>({});
const activeWidget = computed(() => {
	let widget = { id: '__PREVIEW__', name: props.widgetName as string, data: settings.value };
	for (const id of path.value) {
		const child = (widget.data.widgets as NestedWidget[] | undefined)?.find(item => item.id === id);
		if (!child) break;
		widget = child;
	}
	return widget;
});
const activeId = computed(() => activeWidget.value.id);
const activeName = computed(() => activeWidget.value.name as WidgetName);
const activeSettings = computed({
	get: () => activeWidget.value.data,
	set: value => {
		if (path.value.length) activeWidget.value.data = value;
		else settings.value = value;
	},
});
const activeForm = computed(() => path.value.length ? childForm.value : props.form);
const validNestedSettings = computed(() => {
	function valid(name: string, data: Record<string, any>): boolean {
		if (name !== 'nestedWidget') return true;
		const interval = data.interval ?? 10;
		const height = data.maxHeight ?? 0;
		return Number.isFinite(interval) && interval >= 0 && Number.isFinite(height) && height >= 0 &&
			(data.widgets ?? []).every((child: NestedWidget) => valid(child.name, child.data));
	}

	return valid(props.widgetName, settings.value);
});
provide(widgetPreviewContext, {
	register(widget) {
		if (!path.value.length || widget.id !== activeId.value) return;
		childForm.value = widget.form;
		activeSettings.value = deepClone(widget.values);
	},
});

function editChild(id: string) {
	if (!canSave.value) return;
	childForm.value = {};
	path.value = [...path.value, id];
}

function back() {
	if (!canSave.value) return;
	childForm.value = {};
	path.value = path.value.slice(0, -1);
}

function onCanSaveStateChanged(newCanSave: boolean) {
	canSave.value = newCanSave;
}

function save() {
	if (!canSave.value || !validNestedSettings.value) return;
	emit('saved', deepClone(settings.value));
	dialog.value?.close();
}

function cancel() {
	emit('canceled');
	dialog.value?.close();
}

//#region プレビューのリサイズ
const resizerRootEl = useTemplateRef('resizerRootEl');
const resizerEl = useTemplateRef('resizerEl');
const widgetHeight = ref(0);
const widgetScale = ref(1);
const widgetStyle = computed(() => {
	return `translate(-50%, -50%) scale(${widgetScale.value})`;
});
const ro1 = new ResizeObserver(() => {
	widgetHeight.value = resizerEl.value!.clientHeight;
	calcScale();
});
const ro2 = new ResizeObserver(() => {
	calcScale();
});

function calcScale() {
	if (!resizerRootEl.value) return;
	const previewWidth = resizerRootEl.value.clientWidth - 40; // 左右の余白 20pxずつ
	const previewHeight = resizerRootEl.value.clientHeight - 40; // 上下の余白 20pxずつ
	const widgetWidth = 280;
	const scale = Math.min(previewWidth / widgetWidth, previewHeight / widgetHeight.value, 1); // 拡大はしないので1を上限に
	widgetScale.value = scale;
}

onMounted(() => {
	if (resizerEl.value) {
		ro1.observe(resizerEl.value);
	}
	if (resizerRootEl.value) {
		ro2.observe(resizerRootEl.value);
	}
	calcScale();
});

onBeforeUnmount(() => {
	ro1.disconnect();
	ro2.disconnect();
});
//#endregion
</script>

<style module>
.previewContainer {
	display: flex;
	flex-direction: column;
	height: 100%;
	user-select: none;
	-webkit-user-drag: none;
}

.previewTitle {
	position: absolute;
	z-index: 100;
	top: 8px;
	left: 8px;
	padding: 6px 10px;
	border-radius: 6px;
	font-size: 85%;
}

.previewWrapper {
	display: flex;
	flex-direction: column;
	height: 100%;
	pointer-events: none;
	user-select: none;
	-webkit-user-drag: none;
}

.previewResizerRoot {
	position: relative;
	flex: 1 0;
}

.previewResizer {
	position: absolute;
	container-type: inline-size;
	top: 50%;
	left: 50%;
	width: 280px;
}
</style>
