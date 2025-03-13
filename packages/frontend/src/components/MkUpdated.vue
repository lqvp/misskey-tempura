<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :zPriority="'middle'" @click="modal?.close()" @closed="$emit('closed')">
	<div :class="$style.root">
		<div :class="$style.title"><MkSparkle>{{ i18n.ts.misskeyUpdated }}</MkSparkle></div>
		<div :class="$style.version">✨{{ version }}🚀</div>
		<div>
			<MkButton v-if="shouldShowMisskeyButton" :class="$style.updateButton" full @click="whatIsNew">{{ i18n.ts.whatIsNew }}</MkButton>
			<MkButton v-if="shouldShowTempButton" :class="$style.updateButton" full @click="whatIsNewFork">{{ i18n.ts.whatIsNew }} (misskey-temp)</MkButton>
		</div>
		<MkButton :class="$style.gotIt" primary full @click="modal?.close()">{{ i18n.ts.gotIt }}</MkButton>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, shallowRef } from 'vue';
import { version } from '@@/js/config.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';

const props = withDefaults(defineProps<{
			updatedComponent?: 'misskey' | 'temp' | 'both' | null;
	}>(), {
	updatedComponent: null,
});

const modal = shallowRef<InstanceType<typeof MkModal>>();

const shouldShowMisskeyButton = computed(() =>
	props.updatedComponent === 'misskey' || props.updatedComponent === 'both',
);

const shouldShowTempButton = computed(() =>
	props.updatedComponent === 'temp' || props.updatedComponent === 'both',
);

onMounted(() => {
	confetti({
		duration: 1000 * 3,
	});
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	padding: 32px;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.title {
	font-weight: bold;
}

.version {
	margin: 1em 0;
}

.gotIt {
	margin: 8px 0 0 0;
}

.updateButton {
    & + & {
        margin-top: 8px;
    }
}
</style>
