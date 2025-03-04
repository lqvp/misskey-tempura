<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- Contact Form テンプレート修正例 -->
<div class="contact-form">
	<form @submit.prevent="submitForm">
		<!-- 必須項目 -->
		<div class="form-group">
			<label for="subject">{{ i18n.ts._contact.contactFormSubject }}</label>
			<MkInput id="subject" v-model="subject" placeholder="お問い合わせの概要を記入" required/>
		</div>
		<div class="form-group">
			<label for="message">{{ i18n.ts._contact.contactFormMessage }}</label>
			<MkTextarea id="message" v-model="message" placeholder="お問い合わせ内容を記入" required/>
		</div>

		<!-- 推奨項目 -->
		<div class="form-group optional">
			<label for="name">{{ i18n.ts._contact.contactFormName }}</label>
			<MkInput id="name" v-model="name" placeholder="お名前 (任意)"/>
		</div>
		<div class="form-group optional">
			<label for="email">{{ i18n.ts._contact.contactFormEmail }}</label>
			<MkInput id="email" v-model="email" placeholder="メールアドレス (任意)" type="email"/>
		</div>

		<!-- Misskey向け項目 -->
		<div class="form-group optional">
			<label for="misskeyUser">{{ i18n.ts._contact.contactFormMisskeyUser }}</label>
			<MkInput id="misskeyUser" v-model="misskeyUser" placeholder="例: @username"/>
		</div>
		<div class="form-group optional">
			<label for="category">{{ i18n.ts._contact.contactFormCategory }}</label>
			<select id="category" v-model="category">
				<option value="general">{{ i18n.ts._contact.contactFormCategoryGeneral }}</option>
				<option value="bug">{{ i18n.ts._contact.contactFormCategoryBug }}</option>
				<option value="feature">{{ i18n.ts._contact.contactFormCategoryFeature }}</option>
				<option value="other">{{ i18n.ts._contact.contactFormCategoryOther }}</option>
			</select>
		</div>

		<!-- CAPTCHA -->
		<div v-if="needCaptcha" class="form-group captchaContainer">
			<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
			<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
			<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
			<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
			<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
			<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha"/>
		</div>

		<!-- 送信ボタン -->
		<div class="form-group submitButton">
			<MkButton type="submit" large primary rounded :disabled="submitting">
				{{ submitting ? i18n.ts._contact.contactFormSubmitting : i18n.ts._contact.contactFormSubmit }}
			</MkButton>
		</div>
	</form>

	<!-- 確認メッセージ -->
	<div v-if="submitted" class="confirmation-message">
		<p>{{ i18n.ts._contact.contactFormConfirmation }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

const subject = ref('');
const message = ref('');
const name = ref('');
const email = ref('');
const misskeyUser = ref('');
const category = ref('general');
const submitted = ref(false);

// CAPTCHA 用のリアクティブ変数
const hCaptchaResponse = ref<string | null>(null);
const mCaptchaResponse = ref<string | null>(null);
const reCaptchaResponse = ref<string | null>(null);
const turnstileResponse = ref<string | null>(null);
const testcaptchaResponse = ref<string | null>(null);

// captcha が必要かどうか
const needCaptcha = computed(() => {
	return instance.enableHcaptcha ||
           instance.enableMcaptcha ||
           instance.enableRecaptcha ||
           instance.enableTurnstile ||
           instance.enableTestcaptcha;
});

// CAPTCHA 検証の失敗判定（各プロバイダーで値が無い場合）
const captchaFailed = computed((): boolean => {
	return (
		(instance.enableHcaptcha && !hCaptchaResponse.value) ||
        (instance.enableMcaptcha && !mCaptchaResponse.value) ||
        (instance.enableRecaptcha && !reCaptchaResponse.value) ||
        (instance.enableTurnstile && !turnstileResponse.value) ||
        (instance.enableTestcaptcha && !testcaptchaResponse.value)
	);
});

async function submitForm() {
	// 必須項目チェック
	if (!subject.value || !message.value) {
		alert(i18n.ts._contact.contactFormRequired || '必須項目を入力してください');
		return;
	}
	// CAPTCHA が有効の場合、検証済みか確認
	if (needCaptcha.value && captchaFailed.value) {
		alert('CAPTCHA の検証を完了してください');
		return;
	}
	// バックエンドは未実装ですが、送信先は`/contact-send`にしています
	const payload = {
		subject: subject.value,
		message: message.value,
		name: name.value,
		email: email.value,
		misskeyUser: misskeyUser.value,
		category: category.value,
		// 必要に応じて CAPTCHA のレスポンスも送信できます
		captcha: {
			hCaptchaResponse: hCaptchaResponse.value,
			mCaptchaResponse: mCaptchaResponse.value,
			reCaptchaResponse: reCaptchaResponse.value,
			turnstileResponse: turnstileResponse.value,
			testcaptchaResponse: testcaptchaResponse.value,
		},
	};

	try {
		await misskeyApi('contact-send', payload);
		submitted.value = true;
		subject.value = '';
		message.value = '';
		name.value = '';
		email.value = '';
		misskeyUser.value = '';
		category.value = 'general';
	} catch (error) {
		alert(i18n.ts._contact.contactFormError || '送信エラーが発生しました');
	}
}

definePageMetadata(() => ({
	title: i18n.ts._contact.contactForm,
	icon: 'ti ti-forms',
}));
</script>

<style lang="scss" module>
.contact-form {
  max-width: 600px;
  width: 100%;
  margin: 1.5rem auto;
  padding: 16px;
  background-color: var(--MI_THEME-panel);
  border-radius: 8px;
  box-shadow: var(--MI_THEME-shadow);

  @media (max-width: 600px) {
    margin: 1rem auto;
    padding: 8px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    .form-group {
      position: relative;

      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: bold;
        color: var(--MI_THEME-fg);

        &::after {
          content: " *";
          color: var(--MI_THEME-error);
          display: inline-block;
          margin-left: 0.1rem;
          // 必須マークを任意項目では非表示にする
          .optional & {
            display: none;
          }
        }
      }

      :global(input),
      :global(textarea),
      :global(select) {
        width: 100%;
        padding: 0.75rem;
        font-size: 1rem;
        background: var(--MI_THEME-bg);
        color: var(--MI_THEME-fg);
        border: 1px solid var(--MI_THEME-divider);
        border-radius: 4px;
        outline: none;
        transition: all 0.2s ease;

        &::placeholder {
          color: var(--MI_THEME-fgTransparentWeak);
        }

        &:focus {
          border-color: var(--MI_THEME-accent);
          box-shadow: 0 0 0 2px var(--MI_THEME-accentedBg);
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      }

      :global(textarea) {
        min-height: 120px;
        resize: vertical;
      }

      &.error {
        :global(input),
        :global(textarea),
        :global(select) {
          border-color: var(--MI_THEME-error);
        }

        .errorText {
          color: var(--MI_THEME-error);
          font-size: 0.85rem;
          margin-top: 0.3rem;
        }
      }
    }

    .optional label::after {
      display: none;
    }

    .captchaContainer {
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .submitButton {
      margin-top: 1rem;
    }
  }

  .confirmation-message {
    margin-top: 1.5rem;
    padding: 1rem;
    text-align: center;
    color: var(--MI_THEME-success);
    background-color: var(--MI_THEME-infoBg);
    border: 1px solid var(--MI_THEME-success);
    border-radius: 4px;
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
