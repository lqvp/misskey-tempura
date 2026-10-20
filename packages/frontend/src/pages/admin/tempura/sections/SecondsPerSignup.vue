<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput :modelValue="value" type="number" @update:modelValue="onSecondsPerSignupChange">
		<template #label>
			<span>{{ i18n.ts.secondsPerSignup }}</span>
			<span v-if="changed" class="_modified">{{ i18n.ts.modified }}</span>
			<span class="_beta">{{ i18n.ts.originalFeature }}</span>
		</template>
		<template #caption>{{ i18n.ts.secondsPerSignupDescription }}</template>
	</MkInput>
	<MkButton v-if="changed" primary @click="save">{{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const value = ref<number>(props.meta.secondsPerSignup);
const original = ref<number>(props.meta.secondsPerSignup);

const changed = computed(() => value.value !== original.value);

function onSecondsPerSignupChange(v: number) {
	value.value = Number(v);
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		secondsPerSignup: value.value,
	}).then(() => {
		fetchInstance(true);
		original.value = value.value;
	});
}
</script>
