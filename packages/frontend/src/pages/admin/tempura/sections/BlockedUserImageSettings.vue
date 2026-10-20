<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-ban"></i></template>
	<template #label>{{ i18n.ts.youBlocked }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkInput v-model="form.state.youBlockedImageUrl" type="url">
			<template #prefix><i class="ti ti-link"></i></template>
			<template #label>{{ i18n.ts.youBlocked }}<span v-if="form.modifiedStates.youBlockedImageUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
		</MkInput>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	youBlockedImageUrl: props.meta.youBlockedImageUrl ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		youBlockedImageUrl: state.youBlockedImageUrl === '' ? null : state.youBlockedImageUrl,
	});
	fetchInstance(true);
});
</script>
