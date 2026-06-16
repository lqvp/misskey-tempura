<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/security" :label="i18n.ts.security" :keywords="['security']" icon="ti ti-lock" :inlining="['2fa']">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/locked_with_key_3d.png" color="#ffbf00">
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

		<SearchMarker v-if="instance.oidcEnabled" :keywords="['oidc', 'sso', 'external', 'auth']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.oidcExternalAuth }}</SearchLabel></template>
				<div v-if="oidcStatus === null" class="_gaps_s">
					<MkLoading />
				</div>
				<div v-else-if="oidcStatus.linked" class="_gaps_s">
					<div style="display: flex; align-items: center; gap: 8px;">
						<i class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
						<span>{{ i18n.ts.oidcLinked }}</span>
					</div>
					<MkButton danger @click="unlinkOidc()">{{ i18n.ts.oidcUnlinkAccount }}</MkButton>
				</div>
				<div v-else class="_gaps_s">
					<div style="display: flex; align-items: center; gap: 8px;">
						<i class="ti ti-x" style="opacity: 0.5;"></i>
						<span>{{ i18n.ts.oidcNotLinked }}</span>
					</div>
					<MkButton primary @click="linkOidc()">{{ i18n.ts.oidcLinkAccount }}</MkButton>
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
									<MkTime :time="item.createdAt" class="time"/>
								</header>
							</div>
						</div>
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
import { computed, markRaw, ref, onMounted } from 'vue';
import X2fa from './2fa.vue';
import FormSection from '@/components/form/section.vue';
import FormSlot from '@/components/form/slot.vue';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { Paginator } from '@/utility/paginator.js';

const oidcStatus = ref<{ linked: boolean; providerUserId?: string } | null>(null);

onMounted(async () => {
	if (instance.oidcEnabled) {
		try {
			oidcStatus.value = await misskeyApi('oidc/status', {});
		} catch {
			oidcStatus.value = { linked: false };
		}
	}
});

async function linkOidc() {
	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	try {
		const res = await misskeyApi('oidc/link', {});
		window.location.href = res.authorizationUrl;
	} catch (err) {
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: i18n.ts.somethingHappened,
		});
	}
}

async function unlinkOidc() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.oidcUnlinkAccount,
		text: i18n.ts.oidcUnlinkConfirm,
	});
	if (canceled) return;

	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	try {
		await misskeyApi('oidc/unlink', {});
		oidcStatus.value = { linked: false };
		os.success();
	} catch {
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: i18n.ts.somethingHappened,
		});
	}
}

const paginator = markRaw(new Paginator('i/signin-history', {
	limit: 5,
}));

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

		> .time {
			margin-left: auto;
			opacity: 0.7;
		}
	}
}
</style>
