<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkTextarea v-model="value">
		<template #label>{{ i18n.ts.customSplashText }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
		<template #caption>{{ i18n.ts.customSplashTextDescription }}</template>
	</MkTextarea>
	<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const value = ref<string>(props.meta.customSplashText ? props.meta.customSplashText.join('\n') : '');

function save() {
	os.apiWithDialog('admin/update-meta', {
		customSplashText: value.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}
</script>
