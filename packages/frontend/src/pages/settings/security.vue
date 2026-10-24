<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/security" :label="i18n.ts.security" :keywords="['security']" icon="ti ti-lock" :inlining="['2fa']">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f510.png" color="#ffbf00">
			<SearchText>{{ i18n.ts._settings.securityBanner }}</SearchText>
		</MkFeatureBanner>

		<SearchMarker :keywords="['password']">
			<FormSection first>
				<template #label><SearchLabel>{{ i18n.ts.password }}</SearchLabel></template>

				<SearchMarker>
					<MkButton primary @click="change()">
						<SearchLabel>{{ i18n.ts.changePassword }}</SearchLabel>
					</MkButton>
				</SearchMarker>
			</FormSection>
		</SearchMarker>

		<X2fa/>

		<SearchMarker v-if="(instance.ssoProviders ?? []).length > 0 || ssoOrphanedProviders.length > 0" :keywords="['sso', 'oidc', 'external', 'auth']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.ssoExternalAuth }}</SearchLabel></template>

				<div class="_gaps_s">
					<div v-for="provider in instance.ssoProviders" :key="provider.key" class="_gaps_s" style="display: flex; align-items: center; gap: 8px;">
						<i class="ti" :class="ssoProviderIcon(provider.type)"></i>
						<span style="flex: 1;">{{ provider.buttonLabel || provider.key }}</span>
						<span v-if="ssoLinkedProviders.has(provider.key)" style="color: var(--MI_THEME-success); font-size: 0.9em;">{{ i18n.ts.ssoLinked }}</span>
						<MkButton v-if="ssoLinkedProviders.has(provider.key)" danger :disabled="ssoBusy" @click="unlinkSso(provider.key)">{{ i18n.ts.ssoUnlinkAccount }}</MkButton>
						<MkButton v-else primary :disabled="ssoBusy" @click="linkSso(provider.key)">{{ i18n.ts.ssoLinkAccount }}</MkButton>
					</div>
					<!-- 無効化・削除されたプロバイダーの残った連携 (解除のみ可能) -->
					<div v-for="providerKey in ssoOrphanedProviders" :key="providerKey" class="_gaps_s" style="display: flex; align-items: center; gap: 8px;">
						<i class="ti ti-key"></i>
						<span style="flex: 1;">{{ providerKey }}</span>
						<span style="color: var(--MI_THEME-warn); font-size: 0.9em;">{{ i18n.ts.ssoLinked }}</span>
						<MkButton danger :disabled="ssoBusy" @click="unlinkSso(providerKey)">{{ i18n.ts.ssoUnlinkAccount }}</MkButton>
					</div>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['signin', 'login', 'history', 'log']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.signinHistory }}</SearchLabel></template>
				<MkPagination :paginator="paginator" withControl :forceDisableInfiniteScroll="true">
					<template #default="{items}">
						<div>
							<div v-for="item in items" :key="item.id" v-panel class="timnmucd">
								<header>
									<i v-if="item.success" class="ti ti-check icon succ"></i>
									<i v-else class="ti ti-circle-x icon fail"></i>
									<code class="ip _monospace">{{ item.ip }}</code>
									<span v-if="item.country" class="country" :title="i18n.ts._loginRisk.country">{{ item.country }}</span>
									<span v-if="item.challenge != null" class="challenge" :class="item.challenge" :title="i18n.ts._loginRisk.challengeStatus">{{ challengeLabel(item.challenge) }}</span>
									<MkTime :time="item.createdAt" class="time"/>
								</header>
							</div>
						</div>
					</template>
				</MkPagination>
			</FormSection>
		</SearchMarker>

		<SearchMarker v-if="footprintsAvailable" :keywords="['signin', 'login', 'suspicious', 'risk']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._loginRisk.footprints }}</SearchLabel></template>
				<template #description>{{ i18n.ts._loginRisk.footprintsDescription }}</template>
				<MkPagination :paginator="footprintsPaginator" withControl :forceDisableInfiniteScroll="true">
					<template #default="{items}">
						<MkSigninRiskItem v-for="item in items" :key="item.id" :signin="item"/>
					</template>
				</MkPagination>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['regenerate', 'refresh', 'reset', 'token']">
			<FormSection>
				<FormSlot>
					<MkButton danger @click="regenerateToken"><i class="ti ti-refresh"></i> <SearchLabel>{{ i18n.ts.regenerateLoginToken }}</SearchLabel></MkButton>
					<template #caption>{{ i18n.ts.regenerateLoginTokenDescription }}</template>
				</FormSlot>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import X2fa from './2fa.vue';
import FormSection from '@/components/form/section.vue';
import FormSlot from '@/components/form/slot.vue';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkSigninRiskItem from '@/components/MkSigninRiskItem.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance, fetchInstance } from '@/instance.js';
import { definePage } from '@/page.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { Paginator } from '@/utility/paginator.js';

const paginator = markRaw(new Paginator('i/signin-history', {
	limit: 5,
}));

const ssoLinkedProviders = ref(new Set<string>());
const ssoBusy = ref(false);

// instance.ssoProviders に存在しない (無効化・削除された) プロバイダーの残った連携
const ssoOrphanedProviders = computed(() => {
	const knownKeys = new Set((instance.ssoProviders ?? []).map(p => p.key));
	return [...ssoLinkedProviders.value].filter(key => !knownKeys.has(key));
});

function ssoProviderIcon(type: string): string {
	switch (type) {
		case 'github': return 'ti-brand-github';
		case 'discord': return 'ti-brand-discord';
		case 'google': return 'ti-brand-google';
		default: return 'ti-key';
	}
}

async function reloadSsoStatus() {
	try {
		const status = await misskeyApi('sso/status');
		ssoLinkedProviders.value = new Set(status.links.map(l => l.provider));
	} catch (err) {
		console.error('Failed to fetch SSO status:', err);
	}
}

reloadSsoStatus();

// SSO連携のコールバックから戻ってきた場合
{
	const url = new URL(window.location.href);
	if (url.searchParams.get('sso_linked')) {
		os.toast(i18n.ts.ssoLinkSucceeded);
		url.searchParams.delete('sso_linked');
		window.history.replaceState(null, '', url.toString());
	}
}

async function linkSso(providerKey: string) {
	ssoBusy.value = true;
	try {
		const res = await misskeyApi('sso/link', { provider: providerKey });
		// CSRF対策のブラウザ束縛値をCookieに保存してからIdPへ遷移する (callbackで照合される)
		const secure = window.location.protocol === 'https:' ? '; Secure' : '';
		window.document.cookie = `sso_binding=${res.binding}; Path=/api/sso; SameSite=Lax; Max-Age=600${secure}`;
		window.location.href = res.authorizationUrl;
	} catch (err) {
		ssoBusy.value = false;
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function unlinkSso(providerKey: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.ssoUnlinkConfirm,
	});
	if (canceled) return;

	ssoBusy.value = true;
	try {
		await misskeyApi('sso/unlink', { provider: providerKey });
		await reloadSsoStatus();
		os.success();
	} catch (err) {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		ssoBusy.value = false;
	}
}

// サーバーが本人にも見せる設定のときだけ表示する。見せない設定なら NOT_AVAILABLE が返る。
// それ以外のエラーは隠さず、一覧の側でエラーを表示させる
const LOGIN_RISK_FOOTPRINTS_NOT_AVAILABLE = 'c614de8d-5423-450b-9cea-e88da2a7e962';
const footprintsAvailable = ref(false);
const footprintsPaginator = markRaw(new Paginator('i/login-risk-footprints', {
	limit: 5,
}));
misskeyApi('i/login-risk-footprints', { limit: 1 }).then(() => {
	footprintsAvailable.value = true;
}, (err) => {
	footprintsAvailable.value = err?.id !== LOGIN_RISK_FOOTPRINTS_NOT_AVAILABLE;
});

function challengeLabel(challenge: NonNullable<Misskey.entities.Signin['challenge']>): string {
	switch (challenge) {
		case 'emailCode': return i18n.ts._loginRisk.challengeStatusEmailCode;
		case 'passed': return i18n.ts._loginRisk.challengeStatusPassed;
		case 'failed': return i18n.ts._loginRisk.challengeStatusFailed;
	}
}

async function change() {
	const { canceled: canceled2, result: newPassword } = await os.inputText({
		title: i18n.ts.newPassword,
		type: 'password',
		autocomplete: 'new-password',
	});
	if (canceled2 || newPassword == null) return;

	const { canceled: canceled3, result: newPassword2 } = await os.inputText({
		title: i18n.ts.newPasswordRetype,
		type: 'password',
		autocomplete: 'new-password',
	});
	if (canceled3 || newPassword2 == null) return;

	if (newPassword !== newPassword2) {
		os.alert({
			type: 'error',
			text: i18n.ts.retypedNotMatch,
		});
		return;
	}

	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	os.apiWithDialog('i/change-password', {
		currentPassword: auth.result.password,
		token: auth.result.token,
		newPassword,
	});
}

async function regenerateToken() {
	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	misskeyApi('i/regenerate-token', {
		password: auth.result.password,
		token: auth.result.token,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>

<style lang="scss" scoped>
.timnmucd {
	padding: 12px;

	&:first-child {
		border-top-left-radius: 6px;
		border-top-right-radius: 6px;
	}

	&:last-child {
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}

	&:not(:last-child) {
		border-bottom: solid 0.5px var(--MI_THEME-divider);
	}

	> header {
		display: flex;
		align-items: center;

		> .icon {
			width: 1em;
			margin-right: 0.75em;

			&.succ {
				color: var(--MI_THEME-success);
			}

			&.fail {
				color: var(--MI_THEME-error);
			}
		}

		> .ip {
			flex: 1;
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin-right: 12px;
		}

		> .country {
			margin-right: 12px;
			opacity: 0.7;
		}

		> .challenge {
			margin-right: 12px;
			padding: 2px 6px;
			border-radius: 4px;
			font-size: 85%;
			white-space: nowrap;
			background: var(--MI_THEME-infoBg);
			color: var(--MI_THEME-infoFg);

			&.failed {
				background: var(--MI_THEME-infoWarnBg);
				color: var(--MI_THEME-infoWarnFg);
			}
		}

		> .time {
			margin-left: auto;
			opacity: 0.7;
		}
	}
}
</style>
