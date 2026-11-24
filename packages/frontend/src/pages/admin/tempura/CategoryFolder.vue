<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="wrapperEl">
	<MkFolder
		:defaultOpen="shouldOpen"
		:canPage="false"
	>
		<template #icon><slot name="icon"/></template>
		<template #label><slot name="label"/></template>
		<slot/>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { nextTick, useTemplateRef, watch } from 'vue';
import MkFolder from '@/components/MkFolder.vue';

const props = defineProps<{
	shouldOpen: boolean;
}>();

const wrapperEl = useTemplateRef('wrapperEl');

watch(() => props.shouldOpen, (shouldOpen) => {
	if (!shouldOpen) return;
	nextTick(() => {
		const group = wrapperEl.value?.querySelector<HTMLElement>(':scope > [role="group"]');
		const header = group?.querySelector<HTMLButtonElement>('[data-testid="folder-header"]');
		if (group?.getAttribute('aria-expanded') === 'false' && header != null) {
			header.click();
		}
	});
});
</script>
