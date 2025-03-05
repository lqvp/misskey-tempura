<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="contact-form-page container">
	<MkStickyContainer>
		<template #header>
			<MkPageHeader :title="i18n.ts._contact.form"/>
		</template>
		<MkSpacer :contentMax="600" :marginMin="20">
			<div class="contact-form-wrapper">
				<form @submit.prevent="submitForm">
					<div class="_gaps_m">
						<!-- Required Fields -->
						<div class="form-group">
							<label for="subject">{{ i18n.ts._contact._form.subject }}<span class="required">*</span></label>
							<MkInput
								id="subject"
								v-model="formData.subject"
								:placeholder="i18n.ts._contact._form.subjectPlaceholder"
								required
							/>
						</div>

						<div class="form-group">
							<label for="message">{{ i18n.ts._contact._form.message }}<span class="required">*</span></label>
							<MkTextarea
								id="message"
								v-model="formData.message"
								:placeholder="i18n.ts._contact._form.messagePlaceholder"
								required
								tall
							/>
						</div>

						<!-- Optional Fields -->
						<div class="form-group optional">
							<label for="name">{{ i18n.ts._contact._form.name }}<span class="required">*</span></label>
							<MkInput
								id="name"
								v-model="formData.name"
								:placeholder="i18n.ts._contact._form.namePlaceholder"
								required
							/>
						</div>

						<div class="form-group optional">
							<label for="email">{{ i18n.ts._contact._form.email }}</label>
							<MkInput
								id="email"
								v-model="formData.email"
								type="email"
								:placeholder="i18n.ts._contact._form.emailPlaceholder"
							/>
						</div>

						<!-- Misskey-related Fields -->
						<div class="form-group">
							<label for="misskeyUser">{{ i18n.ts._contact._form.misskeyUser }} <span class="required">*</span></label>
							<MkInput
								id="misskeyUser"
								v-model="formData.misskeyUser"
								:placeholder="i18n.ts._contact._form.misskeyUserPlaceholder"
								required
							/>
						</div>

						<div class="form-group optional">
							<label for="category">{{ i18n.ts._contact.category }}</label>
							<MkSelect id="category" v-model="formData.category">
								<option
									v-for="option in categoryOptions"
									:key="option.value"
									:value="option.value"
								>
									{{ option.label }}
								</option>
							</MkSelect>
						</div>

						<!-- CAPTCHA -->
						<div v-if="needCaptcha" class="form-group captchaContainer">
							<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="captcha.hCaptchaResponse" :class="$style.captcha" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
							<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="captcha.mCaptchaResponse" :class="$style.captcha" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
							<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="captcha.reCaptchaResponse" :class="$style.captcha" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
							<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="captcha.turnstileResponse" :class="$style.captcha" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
							<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="captcha.testcaptchaResponse" :class="$style.captcha" provider="testcaptcha"/>
						</div>
					</div>

					<div class="form-actions">
						<MkButton
							type="submit"
							primary
							rounded
							:disabled="submitting || (needCaptcha && captchaFailed)"
							:wait="submitting"
						>
							{{ submitting ? i18n.ts._contact.submitting : i18n.ts._contact.submit }}
						</MkButton>
					</div>
				</form>
			</div>
		</MkSpacer>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, reactive } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import MkWaitingDialog from '@/components/MkWaitingDialog.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';

interface FormData {
	subject: string;
	message: string;
	name: string;
	email: string;
	misskeyUser: string;
	category: string;
}

interface CategoryOption {
	value: string;
	label: string;
}

const formData = reactive<FormData>({
	subject: '',
	message: '',
	name: '',
	email: '',
	misskeyUser: '',
	category: 'general',
});

const categoryOptions = ref<CategoryOption[]>([
	{ value: 'general', label: i18n.ts._contact._category.categoryGeneral },
	{ value: 'bug', label: i18n.ts._contact._category.categoryBug },
	{ value: 'feature', label: i18n.ts._contact._category.categoryFeature },
	{ value: 'other', label: i18n.ts._contact._category.categoryOther },
]);

const captcha = reactive({
	hCaptchaResponse: null,
	mCaptchaResponse: null,
	reCaptchaResponse: null,
	turnstileResponse: null,
	testcaptchaResponse: null,
});

const submitting = ref(false);
const submitted = ref(false);

const needCaptcha = computed(() => {
	return instance.enableHcaptcha ||
		instance.enableMcaptcha ||
		instance.enableRecaptcha ||
		instance.enableTurnstile ||
		instance.enableTestcaptcha;
});

const captchaFailed = computed(() => {
	return (
		(instance.enableHcaptcha && !captcha.hCaptchaResponse) ||
		(instance.enableMcaptcha && !captcha.mCaptchaResponse) ||
		(instance.enableRecaptcha && !captcha.reCaptchaResponse) ||
		(instance.enableTurnstile && !captcha.turnstileResponse) ||
		(instance.enableTestcaptcha && !captcha.testcaptchaResponse)
	);
});

async function submitForm() {
	try {
		submitting.value = true;

		// Validation
		if (!formData.subject || !formData.message || !formData.name || !formData.misskeyUser) {
			os.alert({
				type: 'error',
				text: i18n.ts._contact.requiredFieldsMissing,
			});
			return;
		}

		if (needCaptcha.value && captchaFailed.value) {
			os.alert({
				type: 'error',
				text: i18n.ts._contact.captchaVerificationRequired,
			});
			return;
		}

		// Use popup API directly to create and control the waiting dialog
		const showing = ref(true);
		const waitingDialog = os.popup(MkWaitingDialog, {
			success: false,
			showing: showing,
		}, {});

		try {
			// Use misskeyApi directly to prevent sending UI-related data in the payload
			await misskeyApi('contact-send', {
				...formData,
				'hcaptcha-response': captcha.hCaptchaResponse,
				'm-captcha-response': captcha.mCaptchaResponse,
				'g-recaptcha-response': captcha.reCaptchaResponse,
				'turnstile-response': captcha.turnstileResponse,
				'testcaptcha-response': captcha.testcaptchaResponse,
			});

			// Reset form before showing success message to avoid UI conflicts
			resetForm();
			submitted.value = true;

			// Show success message after successful submission
			os.alert({
				type: 'success',
				title: i18n.ts._contact.submissionSuccess,
				text: i18n.ts._contact.confirmationMessage,
			});
		} catch (err: any) {
			// Handle API errors
			os.alert({
				type: 'error',
				text: err.message || i18n.ts.somethingHappened,
			});
		} finally {
			// Dismiss the waiting dialog by updating the reactive reference
			showing.value = false;
			waitingDialog.dispose();
		}
	} finally {
		submitting.value = false;
	}
}

function resetForm() {
	formData.subject = '';
	formData.message = '';
	formData.name = '';
	formData.email = '';
	formData.misskeyUser = '';
	formData.category = 'general';
	Object.keys(captcha).forEach(key => captcha[key] = null);
}

definePageMetadata(() => ({
	title: i18n.ts._contact.form,
	icon: 'ti ti-forms',
}));
</script>

<style lang="scss" module>
.contact-form-page {
	:global(.container) {
		max-width: 600px;
		margin: 0 auto;
	}
}

.contact-form-wrapper {
	background: var(--panel);
	border-radius: var(--radius-lg);
	padding: 32px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

	form {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
}

.form-group {
	display: flex;
	flex-direction: column;
	gap: 8px;

	label {
		font-weight: bold;
		color: var(--fg);
		font-size: 0.9em;
	}
}

.form-actions {
	margin-top: 24px;
	display: flex;
	justify-content: flex-end;
}

@media (max-width: 500px) {
	.contact-form-wrapper {
		padding: 20px;
		margin: 0 -16px;
		border-radius: 0;
		box-shadow: none;
	}
}
</style>
