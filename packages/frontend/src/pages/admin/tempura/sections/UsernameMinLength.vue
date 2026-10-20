<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput :modelValue="value" type="number" @update:modelValue="onUsernameMinLengthChange">
		<template #label>
			<span>{{ i18n.ts.validateMinimumUsernameLength }}</span>
			<span v-if="changed" class="_modified">{{ i18n.ts.modified }}</span>
			<span class="_beta">{{ i18n.ts.originalFeature }}</span>
		</template>
		<template #caption>{{ i18n.ts.validateMinimumUsernameLengthDescription }}</template>
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

const value = ref<number | null>(props.meta.validateMinimumUsernameLength ?? null);
const original = ref<number | null>(props.meta.validateMinimumUsernameLength ?? null);

const changed = computed(() => value.value !== original.value);

function onUsernameMinLengthChange(v: number) {
	value.value = v;
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		validateMinimumUsernameLength: value.value ?? undefined,
	}).then(() => {
		fetchInstance(true);
		original.value = value.value;
	});
}
</script>
