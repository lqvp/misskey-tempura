<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-photo-shield"></i></template>
	<template #label>{{ i18n.ts._mediaProxySetting.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="savedMediaProxy !== ''" #suffix>{{ i18n.ts.enabled }}</template>
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

		<MkButton v-if="savedMediaProxy !== ''" :disabled="reconciling" @click="reconcile">
			<i class="ti ti-refresh"></i> {{ i18n.ts._mediaProxySetting.reconcile }}
		</MkButton>
		<div v-if="savedMediaProxy !== ''" class="_caption">{{ i18n.ts._mediaProxySetting.reconcileDescription }}</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { validateMediaProxyUrl } from '@@/js/media-proxy.js';
import { useForm } from '@/composables/use-form.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();
const reconciling = ref(false);

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
	// 保存ボタンは canSaving (= 同じ検証結果) で無効化されるため通常ここには来ない
	if (!result.ok) throw new Error('Invalid mediaProxy URL');
	await os.apiWithDialog('admin/update-meta', {
		mediaProxy: result.normalized,
	});
	form.state.mediaProxy = result.normalized ?? '';
	fetchInstance(true);
});

/** 保存済みの値 (props.meta はページを開いた時点の値なので、保存後の再同期では使えない) */
const savedMediaProxy = computed(() => form.savedState.mediaProxy.trim());

async function reconcile() {
	reconciling.value = true;
	try {
		// 同じ値を再保存すると、保存済みの画像URLを現在の設定へ寄せ直す処理が再実行される
		await os.apiWithDialog('admin/update-meta', {
			mediaProxy: savedMediaProxy.value,
		});
		fetchInstance(true);
	} catch (err) {
		// apiWithDialog が既にエラーを表示しているため、ここでは握りつぶす (未処理 rejection を避ける)
		console.warn('Failed to reconcile media proxy URLs', err);
	} finally {
		reconciling.value = false;
	}
}

const validation = computed(() => validateMediaProxyUrl(form.state.mediaProxy, url));
const validationError = computed(() => validation.value.ok ? null : errorText(validation.value.reason));
const isValid = computed(() => validation.value.ok);
</script>
