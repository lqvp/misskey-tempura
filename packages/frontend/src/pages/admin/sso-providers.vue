<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<div class="_gaps">
				<div>{{ i18n.ts._sso.providersDescription }}</div>

				<div class="_buttons">
					<MkButton primary :disabled="!loaded" @click="addProvider">
						<i class="ti ti-plus"></i> {{ i18n.ts.add }}
					</MkButton>
					<MkButton :disabled="!loaded || !hasChanges" @click="saveProviders()">
						<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
					</MkButton>
					<MkButton @click="resetProviders">
						<i class="ti ti-restore"></i> {{ i18n.ts.reset }}
					</MkButton>
				</div>

				<div class="_gaps_s">
					<MkFolder v-for="(provider, index) in providers" :key="provider.uid">
						<template #icon><i class="ti" :class="providerIcon(provider.type)"></i></template>
						<template #label>{{ provider.buttonLabel || provider.key || '(new)' }}</template>
						<template v-if="provider.enabled" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>

						<div class="_gaps_m" style="padding: 16px;">
							<MkInput v-model="provider.key" :disabled="provider.hasClientSecret">
								<template #label>{{ i18n.ts._sso.providerKey }}</template>
								<template #caption>{{ i18n.ts._sso.providerKeyDescription }}</template>
							</MkInput>

							<MkSelect v-model="provider.type" :items="[
								{ label: 'OpenID Connect (authentik, Keycloak, ...)', value: 'oidc' },
								{ label: 'Google', value: 'google' },
								{ label: 'GitHub', value: 'github' },
								{ label: 'Discord', value: 'discord' },
							]">
								<template #label>{{ i18n.ts._sso.providerType }}</template>
							</MkSelect>

							<MkInput v-if="provider.type === 'oidc'" v-model="provider.issuerUrl" placeholder="https://authentik.example.com/application/o/<slug>/">
								<template #label>{{ i18n.ts._sso.issuerUrl }}</template>
							</MkInput>

							<MkInput v-model="provider.clientId">
								<template #label>{{ i18n.ts._sso.clientId }}</template>
							</MkInput>

							<MkInput v-model="provider.clientSecret" type="password" :placeholder="provider.hasClientSecret ? i18n.ts._sso.clientSecretKeepPlaceholder : ''">
								<template #label>{{ i18n.ts._sso.clientSecret }}</template>
								<template v-if="provider.hasClientSecret" #caption>{{ i18n.ts._sso.clientSecretKeepDescription }}</template>
							</MkInput>

							<MkInput v-model="provider.buttonLabel">
								<template #label>{{ i18n.ts._sso.buttonLabel }}</template>
								<template #caption>{{ i18n.ts._sso.buttonLabelDescription }}</template>
							</MkInput>

							<MkSwitch v-model="provider.enabled">
								<template #label>{{ i18n.ts.enable }}</template>
							</MkSwitch>

							<MkSwitch v-model="provider.trustUpstreamMfa">
								<template #label>{{ i18n.ts._sso.trustUpstreamMfa }}</template>
								<template #caption>{{ i18n.ts._sso.trustUpstreamMfaDescription }}</template>
							</MkSwitch>

							<MkInfo v-if="provider.key">
								{{ i18n.ts._sso.redirectUri }}: <code>{{ redirectUri(provider.key) }}</code>
							</MkInfo>

							<MkButton danger @click="removeProvider(index)">
								<i class="ti ti-trash"></i> {{ i18n.ts.delete }}
							</MkButton>
						</div>
					</MkFolder>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance, fetchInstance } from '@/instance.js';
import { definePage } from '@/page.js';

interface SsoProviderEdit {
	/** 画面内だけの行の識別子 (key は編集できるため v-for の :key に使えない。サーバーには送らない) */
	uid: number;
	key: string;
	type: 'github' | 'discord' | 'google' | 'oidc';
	clientId: string;
	/** 空文字 = 保存時に既存値を保持 */
	clientSecret: string;
	hasClientSecret: boolean;
	issuerUrl: string;
	buttonLabel: string;
	enabled: boolean;
	trustUpstreamMfa: boolean;
}

let uidSeq = 0;
const providers = ref<SsoProviderEdit[]>([]);
const originalProviders = ref<SsoProviderEdit[]>([]);
// 読み込みに失敗した空の一覧を保存して、既存のプロバイダー設定を消さないための印
const loaded = ref(false);
// 読み込んだ時点の一覧の版。保存時に送り、他の管理者が先に変更していたらサーバーが保存を止める
const revision = ref('');

const hasChanges = computed(() => {
	return JSON.stringify(providers.value) !== JSON.stringify(originalProviders.value);
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

function providerIcon(type: string): string {
	switch (type) {
		case 'github': return 'ti-brand-github';
		case 'discord': return 'ti-brand-discord';
		case 'google': return 'ti-brand-google';
		default: return 'ti-key';
	}
}

function redirectUri(key: string): string {
	return `${instance.uri}/api/sso/callback/${encodeURIComponent(key)}`;
}

async function loadProviders() {
	try {
		const meta = await misskeyApi('admin/meta');
		providers.value = (meta.ssoProviders ?? []).map(p => ({
			uid: ++uidSeq,
			key: p.key,
			type: p.type as SsoProviderEdit['type'],
			clientId: p.clientId,
			clientSecret: '',
			hasClientSecret: p.hasClientSecret,
			issuerUrl: p.issuerUrl ?? '',
			buttonLabel: p.buttonLabel ?? '',
			enabled: p.enabled,
			trustUpstreamMfa: p.trustUpstreamMfa ?? false,
		}));
		originalProviders.value = JSON.parse(JSON.stringify(providers.value));
		revision.value = meta.ssoProvidersRevision;
		loaded.value = true;
	} catch (error) {
		console.error('Failed to load SSO providers:', error);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

function clientIdChanged(p: SsoProviderEdit): boolean {
	const original = originalProviders.value.find(o => o.key === p.key);
	return original != null && original.clientId !== p.clientId.trim();
}

async function saveProviders(confirmedClientIdUnlink = false) {
	if (!loaded.value) return;
	for (const p of providers.value) {
		if (!p.key || !/^[a-z0-9][a-z0-9_-]*$/.test(p.key)) {
			os.alert({ type: 'error', text: i18n.ts._sso.invalidProviderKey });
			return;
		}
		if (p.enabled && (!p.clientId || (!p.clientSecret && !p.hasClientSecret))) {
			os.alert({ type: 'error', text: i18n.ts._sso.missingClientConfig });
			return;
		}
		if (p.type === 'oidc' && !p.issuerUrl) {
			os.alert({ type: 'error', text: i18n.ts._sso.missingIssuerUrl });
			return;
		}
	}
	const keys = providers.value.map(p => p.key);
	if (new Set(keys).size !== keys.length) {
		os.alert({ type: 'error', text: i18n.ts._sso.duplicateProviderKey });
		return;
	}

	try {
		await misskeyApi('admin/update-meta', {
			ssoProvidersRevision: revision.value,
			ssoProviders: providers.value.map(p => ({
				key: p.key,
				type: p.type,
				clientId: p.clientId,
				clientSecret: p.clientSecret,
				issuerUrl: p.issuerUrl || null,
				buttonLabel: p.buttonLabel || null,
				enabled: p.enabled,
				trustUpstreamMfa: p.trustUpstreamMfa ?? false,
				// 確認済みのときだけ、clientId を変えたプロバイダーの既存の連携の解除を許可する
				...(confirmedClientIdUnlink && clientIdChanged(p) ? { unlinkExistingOnClientIdChange: true } : {}),
			})),
		});

		await loadProviders();
		fetchInstance(true);
		os.success();
	} catch (error) {
		console.error('Failed to save SSO providers:', error);
		if ((error as { code?: string } | null)?.code === 'SSO_PROVIDERS_CONFLICT') {
			// 他の管理者が先に変更した。保存は止まっている。未保存の編集は、ユーザーが選ぶまで捨てない
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._sso.providersConflict });
			if (!canceled) await loadProviders();
			return;
		}
		if ((error as { code?: string } | null)?.code === 'SSO_CLIENT_ID_CHANGE_NEEDS_UNLINK' && !confirmedClientIdUnlink) {
			// 連携済みのユーザーがいる。自動では解除せず、影響を説明して明示的に確認してから、同じ内容でもう一度保存する
			const { canceled } = await os.confirm({ type: 'warning', text: `${i18n.ts._sso.clientIdChangeUnlinkConfirm}\n\n${providers.value.filter(clientIdChanged).map(p => `・${p.key}`).join('\n')}` });
			if (!canceled) await saveProviders(true);
			return;
		}
		if ((error as { code?: string } | null)?.code === 'SSO_PROVIDER_LINKED') {
			os.alert({ type: 'error', text: i18n.ts._sso.providerLinked });
			return;
		}
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

function addProvider() {
	providers.value.push({
		uid: ++uidSeq,
		key: '',
		type: 'oidc',
		clientId: '',
		clientSecret: '',
		hasClientSecret: false,
		issuerUrl: '',
		buttonLabel: '',
		enabled: false,
		trustUpstreamMfa: false,
	});
}

function removeProvider(index: number) {
	providers.value.splice(index, 1);
}

function resetProviders() {
	providers.value = JSON.parse(JSON.stringify(originalProviders.value));
}

loadProviders();

definePage(() => ({
	title: i18n.ts._sso.providers,
	icon: 'ti ti-key',
}));
</script>
