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
		<MkInfo v-if="!isValid" warn>{{ i18n.ts._mediaProxySetting.invalidUrl }}</MkInfo>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { normalizeMediaProxyUrl } from '@@/js/media-proxy.js';
import { useForm } from '@/composables/use-form.js';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const internalMediaProxy = `${normalizeMediaProxyUrl(url) ?? url.replace(/\/+$/, '')}/proxy`;

function validateAndNormalize(raw: string): string | null | undefined {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const normalized = normalizeMediaProxyUrl(trimmed);
	if (normalized == null || normalized.startsWith(`${internalMediaProxy}/`)) {
		return undefined;
	}
	// 自インスタンスのルートオリジンはメディアプロキシのルートを持たず 404 になるため拒否する
	const selfOrigin = normalizeMediaProxyUrl(url);
	if (selfOrigin != null && normalized === selfOrigin) {
		return undefined;
	}
	return normalized;
}

const form = useForm({
	mediaProxy: props.meta.mediaProxy ?? '',
}, async (state) => {
	const normalized = validateAndNormalize(state.mediaProxy);
	if (normalized === undefined) {
		await os.alert({
			type: 'error',
			text: i18n.ts._mediaProxySetting.invalidUrl,
		});
		throw new Error('Invalid mediaProxy URL');
	}
	await os.apiWithDialog('admin/update-meta', {
		mediaProxy: normalized,
	});
	form.state.mediaProxy = normalized ?? '';
	fetchInstance(true);
});

const isValid = computed(() => validateAndNormalize(form.state.mediaProxy) !== undefined);
</script>
