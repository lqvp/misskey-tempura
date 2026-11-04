<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :zPriority="'high'" :anchorElement="anchorElement" @click="modal?.close()" @closed="emit('closed')" @esc="modal?.close()">
	<div class="_popup" :class="{ [$style.root]: true, [$style.asDrawer]: type === 'drawer' }">
		<MkDeliveryTargetEditor
			v-model="draft"
		/>
		<div :class="$style.footer">
			<MkButton transparent rounded @click="emit('destroyed'); modal?.close();">{{ i18n.ts._deliveryTargetControl.clearDeliveryTargets }}</MkButton>
			<MkButton primary rounded @click="apply">{{ i18n.ts.ok }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkDeliveryTargetEditor from '@/components/MkDeliveryTargetEditor.vue';
import type { DeliveryTargetEditorModelValue } from '@/components/MkDeliveryTargetEditor.vue';
import { deepClone } from '@/utility/clone.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	modelValue: DeliveryTargetEditorModelValue;
	anchorElement?: HTMLElement | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: DeliveryTargetEditorModelValue): void;
	(ev: 'destroyed'): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');

const draft = ref(deepClone(props.modelValue));

// MkModal listens for Esc with a global keydown handler, so Esc would also close
// the underlying dialog (e.g. the post form). Capture Esc here and stop it from
// reaching those handlers so only this dialog closes.
const HOTKEY_IGNORE_ELEMENTS = ['input', 'textarea'];

function onGlobalKeydown(ev: KeyboardEvent) {
	if (ev.key !== 'Escape') return;
	const activeElement = window.document.activeElement;
	if (activeElement != null) {
		if (HOTKEY_IGNORE_ELEMENTS.includes(activeElement.tagName.toLowerCase())) return;
		if ((activeElement as HTMLElement).isContentEditable) return;
	}
	ev.preventDefault();
	ev.stopImmediatePropagation();
	modal.value?.close();
}

onMounted(() => {
	window.document.addEventListener('keydown', onGlobalKeydown, { capture: true });
});

onBeforeUnmount(() => {
	window.document.removeEventListener('keydown', onGlobalKeydown, { capture: true });
});

function apply() {
	emit('update:modelValue', deepClone(draft.value));
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	width: 420px;
	max-width: 100%;
	max-height: 100%;
	margin: auto;
	box-sizing: border-box;
	overflow: auto;
}

.asDrawer {
	width: 100%;
	border-radius: 24px;
	border-bottom-right-radius: 0;
	border-bottom-left-radius: 0;
	padding-bottom: max(env(safe-area-inset-bottom, 0px), 12px);
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 8px 24px 16px;
}
</style>
