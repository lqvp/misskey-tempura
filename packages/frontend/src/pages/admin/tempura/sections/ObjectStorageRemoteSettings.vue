<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-cloud"></i></template>
	<template #label>Object Storage (Remote)<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkInput v-model="form.state.objectStoragePrefixForRemote">
			<template #label>{{ i18n.ts.objectStoragePrefixForRemote }}<span v-if="form.modifiedStates.objectStoragePrefixForRemote" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts.objectStoragePrefixForRemoteDesc }}</template>
		</MkInput>

		<MkInput v-model="form.state.objectStorageCacheDays">
			<template #label>{{ i18n.ts.objectStorageCacheDays }}<span v-if="form.modifiedStates.objectStorageCacheDays" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts.objectStorageCacheDaysDesc }}</template>
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
	objectStoragePrefixForRemote: props.meta.objectStoragePrefixForRemote,
	objectStorageCacheDays: props.meta.objectStorageCacheDays?.toString() ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		objectStoragePrefixForRemote: state.objectStoragePrefixForRemote,
		objectStorageCacheDays: state.objectStorageCacheDays === '' ? null : Number(state.objectStorageCacheDays),
	});
	fetchInstance(true);
});
</script>
