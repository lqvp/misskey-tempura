<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.container">
		<MkLoading v-if="processing"/>
		<div v-else :class="$style.error">
			<i class="ti ti-alert-triangle" style="font-size: 2em; color: var(--MI_THEME-error);"></i>
			<p>{{ errorMessage }}</p>
			<MkButton @click="goToLogin">{{ i18n.ts.goBack }}</MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { i18n } from '@/i18n.js';
import { login } from '@/accounts.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';

const processing = ref(true);
const errorCode = ref<string | null>(null);

const errorMessage = computed(() => {
	switch (errorCode.value) {
		case 'NOT_LINKED': return i18n.ts.ssoErrorNotLinked;
		case 'ALREADY_LINKED': return i18n.ts.ssoErrorAlreadyLinked;
		case 'ALREADY_LINKED_TO_OTHER': return i18n.ts.ssoErrorAlreadyLinkedToOther;
		case 'INVALID_STATE': return i18n.ts.ssoErrorInvalidState;
		case 'PROVIDER_ERROR': return i18n.ts.ssoErrorProviderError;
		default: return i18n.ts.ssoErrorGeneric;
	}
});

function goToLogin(): void {
	window.location.href = '/';
}

onMounted(async () => {
	const url = new URL(window.location.href);
	const code = url.searchParams.get('code');
	const ssoError = url.searchParams.get('sso_error');

	if (ssoError) {
		errorCode.value = ssoError;
		processing.value = false;
		return;
	}

	if (!code) {
		errorCode.value = 'INVALID_REQUEST';
		processing.value = false;
		return;
	}

	try {
		const res = await misskeyApi('sso/exchange-code', { code });
		if (res.finished) {
			// login() はページをリロードする。code が URL に残ったままだと
			// リロード後に同じコードを再交換して失敗画面になるため、トップへ遷移させる
			await login(res.i, '/');
			return;
		}
		// SSOログインでは finished:false (captcha/2FA等) は発生しない想定
		errorCode.value = 'UNEXPECTED_FLOW';
		processing.value = false;
	} catch {
		errorCode.value = 'EXCHANGE_FAILED';
		processing.value = false;
	}
});

definePage(() => ({
	title: i18n.ts.signinWithSso,
	icon: 'ti ti-key',
}));
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
}

.container {
	text-align: center;
	padding: 2em;
}

.error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1em;
}
</style>
