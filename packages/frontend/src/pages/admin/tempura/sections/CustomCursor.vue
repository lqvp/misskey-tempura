<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-pointer"></i></template>
	<template #label>{{ i18n.ts._customCursor.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

	<div class="_gaps_m">
		<div class="_gaps">
			<MkInput v-model="defaultUrl">
				<template #label><span>{{ i18n.ts._customCursor.defaultCursorImageURL }}</span></template>
				<template #caption>{{ i18n.ts._customCursor.defaultCursorImageUrlDescription }}</template>
			</MkInput>
		</div>
		<div class="_gaps">
			<MkInput v-model="pointerUrl">
				<template #label><span>{{ i18n.ts._customCursor.pointerCursorImageURL }}</span></template>
				<template #caption>{{ i18n.ts._customCursor.pointerCursorImageURLDescription }}</template>
			</MkInput>
		</div>
		<div class="_gaps">
			<MkInput v-model="textUrl">
				<template #label><span>{{ i18n.ts._customCursor.textCursorImageURL }}</span></template>
				<template #caption>{{ i18n.ts._customCursor.textCursorImageURLDescription }}</template>
			</MkInput>
		</div>
		<div class="_gaps">
			<MkInput v-model="progressUrl">
				<template #label>{{ i18n.ts._customCursor.progressCursorImageURL }}</template>
				<template #caption>{{ i18n.ts._customCursor.progressCursorImageURLDescription }}</template>
			</MkInput>
		</div>
		<div class="_gaps">
			<MkInput v-model="waitUrl">
				<template #label>{{ i18n.ts._customCursor.waitCursorImageURL }}</template>
				<template #caption>{{ i18n.ts._customCursor.waitCursorImageURLDescription }}</template>
			</MkInput>
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

const defaultUrl = ref<string | null>(props.meta.customCursorUrl);
const pointerUrl = ref<string | null>(props.meta.customCursorPointerUrl);
const textUrl = ref<string | null>(props.meta.customCursorTextUrl);
const progressUrl = ref<string | null>(props.meta.customCursorProgressUrl);
const waitUrl = ref<string | null>(props.meta.customCursorWaitUrl);

function save() {
	os.apiWithDialog('admin/update-meta', {
		customCursorUrl: defaultUrl.value,
		customCursorPointerUrl: pointerUrl.value,
		customCursorTextUrl: textUrl.value,
		customCursorProgressUrl: progressUrl.value,
		customCursorWaitUrl: waitUrl.value,
	}).then(() => {
		fetchInstance(true);
	});
}
</script>
