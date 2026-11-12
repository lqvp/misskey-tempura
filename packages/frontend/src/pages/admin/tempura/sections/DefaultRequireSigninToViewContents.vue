<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkSwitch v-model="value" @change="onChange">
	<template #label>{{ i18n.ts.defaultRequireSigninToViewContents }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template #caption>{{ i18n.ts.defaultRequireSigninToViewContentsDescription }}</template>
</MkSwitch>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const value = ref<boolean>(props.meta.defaultRequireSigninToViewContents);

async function onChange(v: boolean) {
	await os.apiWithDialog('admin/update-meta', { defaultRequireSigninToViewContents: v });
	fetchInstance(true);
}
</script>
