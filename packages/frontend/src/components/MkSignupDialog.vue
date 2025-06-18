<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="600"
	@close="onClose"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.signup }}</template>

	<div style="overflow-x: clip;">
		<Transition
			mode="out-in"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
		>
			<template v-if="!isAcceptedServerRule">
				<XServerRules @done="isAcceptedServerRule = true" @cancel="onClose"/>
			</template>
			<template v-else>
				<template v-if="currentStep === 'inviteCheck'">
					<XInviteCheck
						@verified="handleInviteVerified"
						@proceedWithoutCode="handleProceedWithoutCode"
						@cancel="onClose"
					/>
				</template>
				<template v-else-if="currentStep === 'form'">
					<XSignup
						:autoSet="autoSet"
						:skipEmailAuth="inviteResult?.skipEmailAuth ?? false"
						:skipApproval="inviteResult?.skipApproval ?? false"
						:invitationCode="inviteResult?.code ?? null"
						@signup="onSignup"
						@signupEmailPending="onSignupEmailPending"
						@approvalPending="onApprovalPending"
					/>
				</template>
			</template>
		</Transition>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XSignup from '@/components/MkSignupDialog.form.vue';
import XServerRules from '@/components/MkSignupDialog.rules.vue';
import XInviteCheck from '@/components/MkSignupInvitationCheckDialog.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	autoSet?: boolean;
}>(), {
	autoSet: false,
});

const emit = defineEmits<{
	(ev: 'done', res: Misskey.entities.SignupResponse): void;
	(ev: 'cancelled'): void;
	(ev: 'closed'): void;
}>();

const currentStep = ref<'inviteCheck' | 'form'>('inviteCheck');

const inviteResult = ref<{
	code: string;
	skipEmailAuth: boolean;
	skipApproval: boolean;
	expiresAt?: Date | null;
} | null>(null);

function handleInviteVerified(info: { code: string; skipEmailAuth: boolean; skipApproval: boolean; expiresAt?: Date | null }) {
	inviteResult.value = info;
	currentStep.value = 'form';
}

function handleProceedWithoutCode() {
	inviteResult.value = null;
	currentStep.value = 'form';
}

const dialog = useTemplateRef('dialog');

const isAcceptedServerRule = ref(false);

function onClose() {
	emit('cancelled');
	dialog.value?.close();
}

function onSignup(res: Misskey.entities.SignupResponse) {
	emit('done', res);
	dialog.value?.close();
}

function onSignupEmailPending() {
	dialog.value?.close();
}

function onApprovalPending() {
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.3s cubic-bezier(0,0,.35,1), transform 0.3s cubic-bezier(0,0,.35,1);
}
.transition_x_enterFrom {
	opacity: 0;
	transform: translateX(50px);
}
.transition_x_leaveTo {
	opacity: 0;
	transform: translateX(-50px);
}
</style>
