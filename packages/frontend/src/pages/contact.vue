<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
		<div v-if="!isSubmitted" class="_gaps_m">
			<div class="_gaps">
				<div>
					<h1><i class="ti ti-mail"></i> {{ i18n.ts._contactForm.contactUs }}</h1>
					<p>{{ i18n.ts._contactForm.contactDescription }}</p>
				</div>
			</div>

			<MkForm :disabled="submitting" @submit="submit">
				<FormSection>
					<template #label><i class="ti ti-forms"></i> {{ i18n.ts._contactForm.category }}</template>
					<MkSelect v-model="category" :required="true">
						<option value="bug_report">{{ i18n.ts._contactForm.bugReport }}</option>
						<option value="feature_request">{{ i18n.ts._contactForm.featureRequest }}</option>
						<option value="account_issue">{{ i18n.ts._contactForm.accountIssue }}</option>
						<option value="technical_issue">{{ i18n.ts._contactForm.technicalIssue }}</option>
						<option value="content_issue">{{ i18n.ts._contactForm.contentIssue }}</option>
						<option value="other">{{ i18n.ts._contactForm.other }}</option>
					</MkSelect>
				</FormSection>

				<FormSection>
					<template #label><i class="ti ti-pencil"></i> {{ i18n.ts._contactForm.subject }} *</template>
					<MkInput
						v-model="subject"
						:required="true"
						:placeholder="i18n.ts._contactForm.subjectPlaceholder"
						:max="256"
					/>
				</FormSection>

				<FormSection>
					<template #label><i class="ti ti-message-2"></i> {{ i18n.ts._contactForm.content }} *</template>
					<MkTextarea
						v-model="content"
						:required="true"
						:placeholder="i18n.ts._contactForm.contentPlaceholder"
						:minlength="10"
						:maxlength="10000"
						:rows="6"
					/>
				</FormSection>

				<FormSection>
					<template #label><i class="ti ti-user"></i> {{ i18n.ts._contactForm.name }}</template>
					<template #caption>{{ i18n.ts._contactForm.nameCaption }}</template>
					<MkInput
						v-model="name"
						:placeholder="i18n.ts._contactForm.namePlaceholder"
						:max="256"
					/>
				</FormSection>

				<FormSection>
					<template #label><i class="ti ti-mail-forward"></i> {{ i18n.ts._contactForm.replyMethod }} *</template>
					<MkRadios v-model="replyMethod" :required="true">
						<option value="email">{{ i18n.ts._contactForm.replyByEmail }}</option>
						<option value="misskey">{{ i18n.ts._contactForm.replyByMisskey }}</option>
					</MkRadios>
				</FormSection>

				<FormSection v-if="replyMethod === 'email'">
					<template #label><i class="ti ti-mail"></i> {{ i18n.ts._contactForm.email }} *</template>
					<MkInput
						v-model="email"
						type="email"
						:required="replyMethod === 'email'"
						:placeholder="i18n.ts._contactForm.emailPlaceholder"
						:max="512"
					/>
				</FormSection>

				<FormSection v-if="replyMethod === 'misskey'">
					<template #label><i class="ti ti-at"></i> {{ i18n.ts._contactForm.misskeyUsername }} *</template>
					<template #caption>{{ i18n.ts._contactForm.misskeyUsernameCaption }}</template>
					<MkInput
						v-model="misskeyUsername"
						:required="replyMethod === 'misskey'"
						:placeholder="i18n.ts._contactForm.misskeyUsernamePlaceholder"
						:max="128"
					/>
				</FormSection>

				<FormSection v-if="instance.enableHcaptcha">
					<MkCaptcha v-model="captchaToken" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
				</FormSection>
				<FormSection v-else-if="instance.enableRecaptcha">
					<MkCaptcha v-model="captchaToken" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
				</FormSection>
				<FormSection v-else-if="instance.enableTurnstile">
					<MkCaptcha v-model="captchaToken" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
				</FormSection>
				<FormSection v-else-if="instance.enableMcaptcha">
					<MkCaptcha v-model="captchaToken" provider="mcaptcha" :sitekey="instance.mcaptchaSitekey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				</FormSection>
				<FormSection v-else-if="instance.enableTestcaptcha">
					<MkCaptcha v-model="captchaToken" provider="testcaptcha"/>
				</FormSection>

				<div class="_buttons">
					<MkButton type="submit" :disabled="submitting || !canSubmit" primary rounded style="margin: 0 auto;">
						<template v-if="submitting"><MkLoading :size="16"/></template>
						<template v-else><i class="ti ti-send"></i> {{ i18n.ts._contactForm.submit }}</template>
					</MkButton>
				</div>
			</MkForm>
		</div>

		<div v-else class="_gaps_m" style="text-align: center;">
			<div>
				<i class="ti ti-check" style="color: var(--MI_THEME-success); font-size: 3em;"></i>
			</div>
			<div>
				<h2>{{ i18n.ts._contactForm.submitComplete }}</h2>
				<p>{{ i18n.ts.thanksForYourContinuedSupport }}</p>
			</div>
			<div>
				<MkButton inline @click="reset">{{ i18n.ts.goToTop }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import MkForm from '@/components/form/form.vue';
import FormSection from '@/components/form/section.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import MkLoading from '@/components/MkLoading.vue';
import * as os from '@/os.js';

// フォームの状態
const submitting = ref(false);
const isSubmitted = ref(false);

// フォームフィールド
const category = ref('other');
const subject = ref('');
const content = ref('');
const name = ref('');
const replyMethod = ref<'email' | 'misskey'>('email');
const email = ref('');
const misskeyUsername = ref('');
const captchaToken = ref<string | null>(null);

// バリデーション
const canSubmit = computed(() => {
	if (!subject.value.trim()) return false;
	if (!content.value.trim() || content.value.length < 10) return false;
	if (replyMethod.value === 'email' && !email.value.trim()) return false;
	if (replyMethod.value === 'misskey' && !misskeyUsername.value.trim()) return false;

	// CAPTCHA必須の場合
	const captchaRequired = instance.enableHcaptcha || instance.enableRecaptcha ||
	                       instance.enableTurnstile || instance.enableMcaptcha || instance.enableTestcaptcha;
	if (captchaRequired && !captchaToken.value) return false;

	return true;
});

async function submit() {
	if (!canSubmit.value) return;

	submitting.value = true;

	try {
		const payload: any = {
			subject: subject.value.trim(),
			content: content.value.trim(),
			category: category.value,
			replyMethod: replyMethod.value,
		};

		if (name.value.trim()) {
			payload.name = name.value.trim();
		}

		if (replyMethod.value === 'email') {
			payload.email = email.value.trim();
		} else {
			payload.misskeyUsername = misskeyUsername.value.trim().replace(/^@/, '');
		}

		// CAPTCHA情報を追加
		if (instance.enableHcaptcha && captchaToken.value) {
			payload['hcaptcha-response'] = captchaToken.value;
		} else if (instance.enableRecaptcha && captchaToken.value) {
			payload['g-recaptcha-response'] = captchaToken.value;
		} else if (instance.enableTurnstile && captchaToken.value) {
			payload['cf-turnstile-response'] = captchaToken.value;
		} else if (instance.enableMcaptcha && captchaToken.value) {
			payload['m-captcha-response'] = captchaToken.value;
		} else if (instance.enableTestcaptcha && captchaToken.value) {
			payload['testcaptcha-response'] = captchaToken.value;
		}

		await os.api('contact-form/submit', payload);
		isSubmitted.value = true;
	} catch (error) {
		console.error('Contact form submission failed:', error);
		os.alert({
			type: 'error',
			text: error.message || i18n.ts.somethingHappened,
		});
	} finally {
		submitting.value = false;
	}
}

function reset() {
	// フォームをリセット
	category.value = 'other';
	subject.value = '';
	content.value = '';
	name.value = '';
	replyMethod.value = 'email';
	email.value = '';
	misskeyUsername.value = '';
	captchaToken.value = null;
	isSubmitted.value = false;
	submitting.value = false;
}

definePage(() => ({
	title: i18n.ts._contactForm.contactUs,
	icon: 'ti ti-mail',
}));
</script>
