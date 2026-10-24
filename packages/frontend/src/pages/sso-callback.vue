<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.container">
		<MkLoading v-if="processing"/>
		<div v-else-if="passkeyRequest != null" :class="$style.passkey">
			<XPasskey :credentialRequest="passkeyRequest" @done="onPasskeyDone" @useTotp="onUseTotp"/>
		</div>
		<div v-else :class="$style.error">
			<i class="ti ti-alert-triangle" style="font-size: 2em; color: var(--MI_THEME-error);"></i>
			<p>{{ errorMessage }}</p>
			<MkButton @click="goToLogin">{{ i18n.ts.goBack }}</MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue';
import type { PublicKeyCredentialRequestOptionsJSON, AuthenticationResponseJSON } from '@simplewebauthn/browser';
import { i18n } from '@/i18n.js';
import { login } from '@/accounts.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import XPasskey from '@/components/MkSignin.passkey.vue';

const processing = ref(true);
const errorCode = ref<string | null>(null);
const passkeyRequest = shallowRef<PublicKeyCredentialRequestOptionsJSON | null>(null);
let loginCode: string | null = null;

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

	loginCode = code;
	try {
		await processExchangeResponse(await misskeyApi('sso/exchange-code', { code }));
	} catch {
		errorCode.value = 'EXCHANGE_FAILED';
		processing.value = false;
	}
});

// 追加認証 (TOTP / パスキー) が要求されている限り続行し、完了したらログインする
async function processExchangeResponse(initialRes: Misskey.entities.SigninFlowResponse): Promise<void> {
	let res = initialRes;
	let totpAttempts = 0;
	while (!res.finished) {
		if (res.next === 'totp') {
			if (totpAttempts >= 5) throw new Error('TOTP_TOO_MANY_ATTEMPTS');
			totpAttempts++;
			const input = await os.inputText({
				type: 'text',
				title: i18n.ts.totp,
				text: i18n.ts.totpDescription,
				placeholder: '123456',
			});
			if (input.canceled || input.result == null || input.result === '') {
				throw new Error('TOTP_CANCELLED');
			}
			try {
				res = await misskeyApi('sso/exchange-code', { code: loginCode!, token: input.result });
			} catch (err) {
				// TOTP 不一致のみ再入力を促す (コード自体は検証成功まで消費されない)。
				// INVALID_CODE (TTL 切れ) やレート制限など再試行しても回復しないエラーは外側の catch でエラー画面にする
				if ((err as { code?: string }).code !== 'TWO_FACTOR_AUTH_FAILED') throw err;
				os.toast(i18n.ts.somethingHappened);
			}
		} else if (res.next === 'passkey') {
			// セキュリティキーの確認はコンポーネントに委譲し、完了後に onPasskeyDone で再開する
			passkeyRequest.value = res.authRequest;
			processing.value = false;
			return;
		} else {
			throw new Error('UNEXPECTED_FLOW');
		}
	}

	// login() はページをリロードする。code が URL に残ったままだと
	// リロード後に同じコードを再交換して失敗画面になるため、トップへ遷移させる
	await login(res.i, '/');
}

async function onUseTotp(): Promise<void> {
	// パスキーの代わりに TOTP / バックアップコードで追加認証する (ローカルサインインと同じ切り替え)
	passkeyRequest.value = null;
	processing.value = true;
	try {
		await processExchangeResponse({ finished: false, next: 'totp' });
	} catch {
		errorCode.value = 'EXCHANGE_FAILED';
		processing.value = false;
	}
}

async function onPasskeyDone(credential: AuthenticationResponseJSON): Promise<void> {
	processing.value = true;
	passkeyRequest.value = null;
	try {
		await processExchangeResponse(await misskeyApi('sso/exchange-code', { code: loginCode!, credential }));
	} catch (err) {
		// パスキー確認の失敗のみ新しいチャレンジを取得してやり直せる。それ以外はエラー画面へ
		if ((err as { code?: string }).code === 'TWO_FACTOR_AUTH_FAILED') {
			os.toast(i18n.ts.somethingHappened);
			try {
				await processExchangeResponse(await misskeyApi('sso/exchange-code', { code: loginCode! }));
			} catch {
				errorCode.value = 'EXCHANGE_FAILED';
				processing.value = false;
			}
			return;
		}
		errorCode.value = 'EXCHANGE_FAILED';
		processing.value = false;
	}
}

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

.passkey {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
}

.error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1em;
}
</style>
