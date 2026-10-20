<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-photo"></i></template>
	<template #label>{{ i18n.ts.backgroundImageUrls }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<div class="_gaps">
		<MkButton @click="add">{{ i18n.ts.add }}</MkButton>
		<div v-for="(url, i) in urls" :key="i" class="_gaps_s">
			<MkInput v-model="urls[i]">
				<template #label>{{ i18n.ts.backgroundImageUrl }} #{{ i + 1 }}</template>
			</MkInput>
			<MkButton danger @click="remove(i)">
				<i class="ti ti-trash"></i>
				<span>{{ i18n.ts.remove }}</span>
			</MkButton>
		</div>
		<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const urls = ref<string[]>((props.meta.backgroundImageUrls ?? []) as unknown as string[]);

function add() {
	urls.value.push('');
}

function remove(index: number) {
	urls.value.splice(index, 1);
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		backgroundImageUrls: urls.value.filter(url => url !== ''),
	}).then(() => {
		fetchInstance(true);
	});
}
</script>
