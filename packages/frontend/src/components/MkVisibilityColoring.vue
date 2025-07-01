<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" :style="{ background: background }">
</div>
</template>

<script lang="ts" setup>
import { defineProps, computed } from 'vue';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	visibility: 'public' | 'home' | 'followers' | 'specified';
	localOnly: boolean;
	dontShowOnLtl?: boolean;
}>();

const color = computed(() => {
	if (props.visibility === 'public' && props.dontShowOnLtl === true) {
		return prefer.s['noteVisibilityColorPublicNonLtl'];
	}
	switch (props.visibility) {
		case 'home': return prefer.s['noteVisibilityColorHome'];
		case 'followers': return prefer.s['noteVisibilityColorFollowers'];
		case 'specified': return prefer.s['noteVisibilityColorSpecified'];
		default: return 'transparent';
	}
});

const background = computed(() => {
	if (props.localOnly) {
		const theColor = prefer.s['noteVisibilityColorLocalOnly'];
		return `repeating-linear-gradient(135deg, transparent, transparent 5px, ${theColor} 5px, ${theColor} 10px)`;
	}
	return color.value;
});

</script>

<style lang="scss" module>
.root {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: 6px;
}
</style>
