<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.wrapper">
	<div class="_gaps" :class="$style.root">
		<div class="_gaps_s">
			<div :class="$style.emailCodeIcon">
				<i class="ti ti-mail-check"></i>
			</div>
			<div :class="$style.emailCodeDescription">{{ i18n.ts._loginRisk.emailCodeDescription }}</div>
		</div>

		<!-- メール確認コード入力 -->
		<form class="_gaps_s" @submit.prevent="emit('emailCodeSubmitted', code)">
			<MkInput v-model="code" type="text" pattern="^[0-9]{6}$" autocomplete="one-time-code" required autofocus :spellcheck="false" inputmode="numeric">
				<template #label>{{ i18n.ts.token }} ({{ i18n.ts.email }})</template>
				<template #prefix><i class="ti ti-123"></i></template>
			</MkInput>

			<MkButton type="submit" large primary rounded style="margin: 0 auto;">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
		</form>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { i18n } from '@/i18n.js';

import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';

const emit = defineEmits<{
	(ev: 'emailCodeSubmitted', code: string): void;
}>();

const code = ref('');
</script>

<style lang="scss" module>
.wrapper {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 336px;

	> .root {
		width: 100%;
	}
}

.emailCodeIcon {
	margin: 0 auto;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	text-align: center;
	height: 64px;
	width: 64px;
	font-size: 24px;
	line-height: 64px;
	border-radius: 50%;
}

.emailCodeDescription {
	text-align: center;
	font-size: 1.1em;
}
</style>
