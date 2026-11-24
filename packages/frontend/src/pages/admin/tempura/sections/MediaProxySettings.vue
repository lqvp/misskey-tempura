<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-photo-shield"></i></template>
	<template #label>{{ i18n.ts._mediaProxySetting.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.mediaProxy.trim() !== ''" #suffix>{{ i18n.ts.enabled }}</template>
	<template v-else #suffix>{{ i18n.ts.default }}</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form" :canSaving="isValid"/>
	</template>

	<div class="_gaps_m">
		<MkInput v-model="form.state.mediaProxy" type="url">
			<template #prefix><i class="ti ti-link"></i></template>
			<template #label>{{ i18n.ts._mediaProxySetting.url }}<span v-if="form.modifiedStates.mediaProxy" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._mediaProxySetting.serverDescription }}</template>
		</MkInput>
		<MkInfo v-if="validationError != null" warn>{{ validationError }}</MkInfo>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { validateMediaProxyUrl } from '@@/js/media-proxy.js';
import { useForm } from '@/composables/use-form.js';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

function errorText(reason: 'invalid' | 'self' | 'insecure'): string {
	switch (reason) {
		case 'self': return i18n.ts._mediaProxySetting.selfUrl;
		case 'insecure': return i18n.ts._mediaProxySetting.insecureUrl;
		default: return i18n.ts._mediaProxySetting.invalidUrl;
	}
}

const form = useForm({
	mediaProxy: props.meta.mediaProxy ?? '',
}, async (state) => {
	const result = validateMediaProxyUrl(state.mediaProxy, url);
	if (!result.ok) {
		await os.alert({
			type: 'error',
			text: errorText(result.reason),
		});
		throw new Error('Invalid mediaProxy URL');
	}
	await os.apiWithDialog('admin/update-meta', {
		mediaProxy: result.normalized,
	});
	form.state.mediaProxy = result.normalized ?? '';
	fetchInstance(true);
});

const validation = computed(() => validateMediaProxyUrl(form.state.mediaProxy, url));
const validationError = computed(() => validation.value.ok ? null : errorText(validation.value.reason));
const isValid = computed(() => validation.value.ok);
</script>
