<!--
SPDX-FileCopyrightText: syuilo and misskey-project
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
	visibility: string;
	localOnly: boolean;
}>();

const color = computed(() => {
	switch (props.visibility) {
		case 'public_non_ltl': return prefer.s['noteVisibilityColorPublicNonLtl'];
		case 'home': return prefer.s['noteVisibilityColorHome'];
		case 'followers': return prefer.s['noteVisibilityColorFollowers'];
		case 'specified': return prefer.s['noteVisibilityColorSpecified'];
		default: return 'transparent';
	}
});

const background = computed(() => {
	if (props.localOnly) {
		const theColor = props.visibility === 'public' ? prefer.s['noteVisibilityColorLocalOnly'] : color.value;
		return `repeating-linear-gradient(135deg, transparent, transparent 5px, ${theColor} 5px, ${theColor} 10px);`;
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
