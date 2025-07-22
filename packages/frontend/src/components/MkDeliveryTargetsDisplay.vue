<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkTooltip ref="tooltip" :showing="showing" :targetElement="targetElement" :maxWidth="300" @closed="emit('closed')">
	<div :class="$style.root">
		<div :class="$style.title">
			{{ i18n.ts._deliveryTargetControl[mode === 'include' ? 'deliveryTargetsInclude' : 'deliveryTargetsExclude'] }}
		</div>
		<div v-if="hosts && hosts.length" :class="$style.hosts">
			<div v-for="host in hosts" :key="host" :class="$style.host">
				{{ host }}
			</div>
		</div>
	</div>
</MkTooltip>
</template>

<script lang="ts" setup>
import MkTooltip from './MkTooltip.vue';
import { i18n } from '@/i18n.js';

defineProps<{
	showing: boolean;
	mode: 'include' | 'exclude';
	hosts?: string[];
	targetElement?: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();
</script>

<style lang="scss" module>
.root {
	padding: 8px;
	max-width: 300px;
}

.title {
	font-weight: bold;
	margin-bottom: 8px;
}

.hosts {
	max-height: 200px;
	overflow-y: auto;
}

.host {
	padding: 2px 0;
	word-break: break-all;
}
</style>
