<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-wifi-off"></i></template>
	<template #label>{{ i18n.ts._offlinePageSetting.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.message !== '' || form.savedState.contactUrl !== ''" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkTextarea v-model="form.state.message">
			<template #label>{{ i18n.ts._offlinePageSetting.message }}</template>
			<template #caption>{{ i18n.ts._offlinePageSetting.messageDescription }}</template>
		</MkTextarea>

		<MkInput v-model="form.state.contactUrl" type="url">
			<template #label>{{ i18n.ts._offlinePageSetting.contactUrl }}</template>
			<template #caption>{{ i18n.ts._offlinePageSetting.contactUrlDescription }}</template>
		</MkInput>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

// meta.offlinePageConfig is stored as a JSON string; fall back to empty fields
// when it is missing or malformed so the form always starts from a valid state.
function parseOfflinePageConfig(raw: string | null | undefined): { message: string; contactUrl: string } {
	if (raw == null) return { message: '', contactUrl: '' };
	try {
		const parsed = JSON.parse(raw) as { message?: string; contactUrl?: string };
		return {
			message: typeof parsed.message === 'string' ? parsed.message : '',
			contactUrl: typeof parsed.contactUrl === 'string' ? parsed.contactUrl : '',
		};
	} catch {
		return { message: '', contactUrl: '' };
	}
}

const initialConfig = parseOfflinePageConfig(props.meta.offlinePageConfig);

const form = useForm({
	message: initialConfig.message,
	contactUrl: initialConfig.contactUrl,
}, async (state) => {
	// Serialize as a versioned JSON string (null clears the customization)
	const config = (state.message !== '' || state.contactUrl !== '')
		? JSON.stringify({ version: 1, message: state.message, contactUrl: state.contactUrl })
		: null;
	await os.apiWithDialog('admin/update-meta', {
		offlinePageConfig: config,
	});
	fetchInstance(true);
});
</script>
