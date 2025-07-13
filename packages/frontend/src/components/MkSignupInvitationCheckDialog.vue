<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.container">
	<div :class="$style.banner">
		<i class="ti ti-ticket"></i>
	</div>
	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<div v-if="!isVerified" class="_gaps_m">
				<p :class="$style.title">{{ i18n.ts._signupEnhance.inviteCodeCheckTitle }}</p>

				<p v-if="isInviteCodeRequired">{{ i18n.ts._signupEnhance.inviteCodeRequiredPrompt }}</p>
				<p v-else>{{ i18n.ts._signupEnhance.inviteCodePrompt }}</p>

				<div class="_gaps_m">
					<MkInput
						id="invite-code"
						v-model="inviteCode"
						:disabled="isLoading"
						:placeholder="i18n.ts.invitationCode"
						@keydown.enter="checkInviteCode"
					>
						<template #label>{{ i18n.ts.invitationCode }}</template>
					</MkInput>
				</div>

				<div v-if="errorMessage" :class="$style.errorMessage">
					{{ errorMessage }}
				</div>
			</div>

			<div v-if="isVerified && validationResult" class="_gaps_m">
				<p :class="$style.title">{{ i18n.ts._signupEnhance.inviteCodeConfirmTitle }}</p>

				<div :class="$style.successMessage">
					<i class="ti ti-check"></i>
					<span>{{ i18n.ts._signupEnhance.successInviteCodeValid }}</span>
				</div>

				<div v-if="validationResult.skipEmailAuth || validationResult.skipApproval" :class="$style.benefits">
					<p>{{ i18n.ts._signupEnhance.infoBenefitsDescription }}</p>
					<ul :class="$style.benefitsList">
						<li v-if="validationResult.skipEmailAuth">
							<i class="ti ti-mail-off"></i>
							<span>{{ i18n.ts._signupEnhance.infoSkipEmailAuth }}</span>
						</li>
						<li v-if="validationResult.skipApproval">
							<i class="ti ti-user-check"></i>
							<span>{{ i18n.ts._signupEnhance.infoSkipApproval }}</span>
						</li>
					</ul>
				</div>

				<div v-if="validationResult.description" :class="$style.description">
					<p>{{ i18n.ts.description }}</p>
					<p>{{ validationResult.description }}</p>
				</div>

				<p v-if="validationResult.expiresAt" :class="$style.expiresAt">
					<i class="ti ti-calendar-off"></i>
					<span>{{ i18n.tsx._signupEnhance.infoExpiresAt({ expiresAt: new Date(validationResult.expiresAt).toLocaleString() }) }}</span>
				</p>
			</div>

			<div class="_buttonsCenter" style="margin-top: 24px;">
				<template v-if="!isVerified">
					<MkButton
						v-if="canProceedWithoutCode"
						inline rounded
						:wait="isLoading"
						@click="proceedWithoutCode"
					>
						{{ i18n.ts._signupEnhance.proceedWithoutInviteCodeButton }}
					</MkButton>
					<MkButton
						inline rounded primary gradate
						:wait="isLoading"
						@click="checkInviteCode"
					>
						{{ isLoading ? i18n.ts._signupEnhance.checkingInviteCodeButton : i18n.ts._signupEnhance.checkInviteCodeButton }}
						<i class="ti ti-arrow-right"></i>
					</MkButton>
				</template>

				<template v-if="isVerified">
					<MkButton
						inline rounded
						@click="resetCheck"
					>
						{{ i18n.ts._signupEnhance.tryAnotherInviteCodeButton }}
					</MkButton>
					<MkButton
						inline rounded primary gradate
						@click="confirmAndProceed"
					>
						{{ i18n.ts._signupEnhance.useInviteCodeButton }}
						<i class="ti ti-arrow-right"></i>
					</MkButton>
				</template>
			</div>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { instance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';

interface InviteCheckResponse {
	isValid: boolean;
	expiresAt?: string | null;
	skipEmailAuth: boolean;
	skipApproval: boolean;
}

onMounted(() => {
	const params = new URLSearchParams(window.location.search);
	if (params.has('invite-code')) {
		inviteCode.value = params.get('invite-code') ?? '';
	}
});

const emit = defineEmits<{
	(eventName: 'verified', inviteInfo: { code: string; skipEmailAuth: boolean; skipApproval: boolean; expiresAt?: Date | null }): void;
	(eventName: 'proceedWithoutCode'): void;
}>();

const inviteCode = ref('');
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const validationResult = ref<InviteCheckResponse | null>(null);
const isVerified = ref(false);

const isInviteCodeRequired = computed(() => {
	return instance.disableRegistration;
});

const canProceedWithoutCode = computed(() => !instance.disableRegistration);

async function checkInviteCode() {
	if (!inviteCode.value.trim()) {
		errorMessage.value = i18n.ts._signupEnhance.errorInviteCodeEmpty;
		return;
	}

	isLoading.value = true;
	errorMessage.value = null;
	validationResult.value = null;

	try {
		const response = await misskeyApi<InviteCheckResponse>('invite/check', {
			code: inviteCode.value.trim(),
		});

		validationResult.value = response;

		if (response.isValid) {
			isVerified.value = true;
		} else {
			// This case might not be hit if the API throws an error for invalid codes.
			// But as a fallback:
			errorMessage.value = i18n.ts._signupEnhance.errorInviteCodeInvalid;
		}
	} catch (error: any) {
		isVerified.value = false; // Ensure we don't show confirmation on error
		if (error.response?.data?.error?.code === 'INVALID_INVITE_CODE') {
			errorMessage.value = i18n.ts._signupEnhance.errorInviteCodeInvalid;
		} else if (error.response?.data?.error?.code === 'EXPIRED_INVITE_CODE') {
			errorMessage.value = i18n.ts._signupEnhance.errorInviteCodeExpired;
		} else if (error.response?.data?.error?.code === 'INVITE_CODE_ALREADY_USED') {
			errorMessage.value = i18n.ts._signupEnhance.errorInviteCodeUsed;
		} else {
			console.error('Invite code check error:', error);
			errorMessage.value = i18n.ts._signupEnhance.errorUnknown;
		}
	} finally {
		isLoading.value = false;
	}
}

function confirmAndProceed() {
	if (!validationResult.value) return;

	emit('verified', {
		code: inviteCode.value.trim(),
		skipEmailAuth: validationResult.value.skipEmailAuth,
		skipApproval: validationResult.value.skipApproval,
		expiresAt: validationResult.value.expiresAt ? new Date(validationResult.value.expiresAt) : null,
	});
}

function resetCheck() {
	isVerified.value = false;
	inviteCode.value = '';
	validationResult.value = null;
	errorMessage.value = null;
}

function proceedWithoutCode() {
	emit('proceedWithoutCode');
}
</script>

<style lang="scss" module>
.banner {
	padding: 16px;
	text-align: center;
	font-size: 26px;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.title {
	font-size: 1.2em;
	font-weight: bold;
	text-align: center;
}

.errorMessage {
	color: var(--MI_THEME-error);
}

.successMessage {
	color: var(--MI_THEME-success);
}
.successMessage {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-success);
	font-weight: bold;
	font-size: 1.1em;
}

.benefits {
	background-color: var(--MI_THEME-accentedBg);
	padding: 12px;
	border-radius: 8px;
}

.description {
	background-color: var(--MI_THEME-accentedBg);
	padding: 12px;
	border-radius: 8px;
	white-space: pre-wrap;
	word-break: break-word;

	p:first-child {
		font-weight: bold;
		margin-bottom: 4px;
	}
}

.benefitsList {
	list-style: none;
	padding: 0;
	margin: 8px 0 0 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;

	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	i {
		color: var(--MI_THEME-accent);
	}
}

.expiresAt {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fg-3);
	font-size: 0.9em;
}
</style>
