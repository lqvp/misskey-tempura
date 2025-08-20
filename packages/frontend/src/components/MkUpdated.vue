<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" :zPriority="'middle'" @click="modal?.close()" @closed="$emit('closed')">
	<div :class="$style.root">
		<div :class="$style.title"><MkSparkle>{{ i18n.ts.misskeyUpdated }}</MkSparkle></div>
		<div :class="$style.version">✨{{ version }}🚀</div>
		<div v-if="isBeta" :class="$style.beta">{{ i18n.ts.thankYouForTestingBeta }}</div>
		<div>
			<MkButton v-if="shouldShowMisskeyButton" :class="$style.updateButton" full @click="whatIsNew">{{ i18n.ts.whatIsNew }}</MkButton>
			<MkButton v-if="shouldShowTempButton" :class="$style.updateButton" full @click="whatIsNewFork">{{ i18n.ts.whatIsNew }} (misskey-tempura)</MkButton>
		</div>
		<MkButton :class="$style.gotIt" primary full @click="modal?.close()">{{ i18n.ts.gotIt }}</MkButton>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, useTemplateRef } from 'vue';
import { version } from '@@/js/config.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';

const props = withDefaults(defineProps<{
	updatedComponent?: 'misskey' | 'tempura' | 'both' | null;
}>(), {
	updatedComponent: null,
});

const modal = useTemplateRef('modal');

const isBeta = version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');

const shouldShowMisskeyButton = computed(() =>
	props.updatedComponent === 'misskey' || props.updatedComponent === 'both',
);

const shouldShowTempButton = computed(() =>
	props.updatedComponent === 'tempura' || props.updatedComponent === 'both',
);

function whatIsNew() {
	modal.value?.close();
	window.open(`https://misskey-hub.net/docs/releases/#_${version.replace(/\./g, '')}`, '_blank');
}

function whatIsNewFork() {
	modal.value?.close();
	window.open(`/tempura-changelog`, '_blank');
}

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

.beta {
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
