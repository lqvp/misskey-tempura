<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" :class="$style.container">
		<!-- コンタクトフォームが無効な場合 -->
		<div v-if="!instance.enableContactForm" class="_gaps_m" :class="$style.disabledContainer">
			<div>
				<i class="ti ti-ban" :class="$style.disabledIcon"></i>
			</div>
			<div>
				<h2 :class="$style.disabledTitle">{{ i18n.ts._contactForm.contactFormDisabled }}</h2>
				<p :class="$style.disabledDescription">{{ i18n.ts._contactForm.contactFormDisabledDescription }}</p>
			</div>
		</div>

		<!-- コンタクトフォームが有効な場合 -->
		<div v-else-if="!isSubmitted" class="_gaps_m">
			<div class="_gaps">
				<div>
					<h1><i class="ti ti-mail"></i> {{ i18n.ts._contactForm.contactUs }}</h1>
					<p>{{ i18n.ts._contactForm.contactDescription }}</p>
				</div>
			</div>

			<div class="_gaps_m">
				<FormSection>
					<template #label><i class="ti ti-forms"></i> {{ i18n.ts._contactForm.category }}</template>
					<MkSelect v-model="category" :required="true">
						<option v-for="option in categoryOptions" :key="option.value" :value="option.value">
							{{ option.label }}
						</option>
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
						:minlength="20"
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
						:debounce="true"
						type="email"
						:required="replyMethod === 'email'"
						:placeholder="i18n.ts._contactForm.emailPlaceholder"
						:max="512"
						@update:modelValue="onChangeEmail"
					>
						<template v-if="emailState === 'wait'" #suffix><i class="ti ti-loader ti-fw" style="animation: spin 1s linear infinite;"></i></template>
						<template v-else-if="emailState === 'ok'" #suffix><i class="ti ti-check ti-fw" style="color: var(--MI_THEME-success);"></i></template>
						<template v-else-if="emailState && emailState.startsWith('unavailable')" #suffix><i class="ti ti-exclamation-triangle ti-fw" style="color: var(--MI_THEME-error);"></i></template>
						<template v-else-if="emailState === 'error'" #suffix><i class="ti ti-alert-circle ti-fw" style="color: var(--MI_THEME-error);"></i></template>
					</MkInput>
					<div v-if="emailState && emailState !== 'wait' && emailState !== 'ok'" style="margin-top: 8px; color: var(--MI_THEME-error); font-size: 0.9em;">
						<i class="ti ti-exclamation-triangle" style="margin-right: 4px;"></i>
						<span v-if="emailState === 'unavailable:format'">{{ i18n.ts._emailUnavailable.format }}</span>
						<span v-else-if="emailState === 'unavailable:disposable'">{{ i18n.ts._emailUnavailable.disposable }}</span>
						<span v-else-if="emailState === 'unavailable:banned'">{{ i18n.ts._emailUnavailable.banned }}</span>
						<span v-else-if="emailState === 'unavailable:mx'">{{ i18n.ts._emailUnavailable.mx }}</span>
						<span v-else-if="emailState === 'unavailable:smtp'">{{ i18n.ts._emailUnavailable.smtp }}</span>
						<span v-else-if="emailState === 'unavailable'">Invalid email address</span>
						<span v-else-if="emailState === 'error'">Email validation error</span>
					</div>
				</FormSection>

				<FormSection v-if="replyMethod === 'misskey'">
					<template #label><i class="ti ti-at"></i> {{ i18n.ts._contactForm.misskeyUsername }} *</template>
					<template #caption>{{ i18n.ts._contactForm.misskeyUsernameCaption }}</template>
					<MkInput
						v-model="misskeyUsername"
						:required="replyMethod === 'misskey'"
						placeholder="username@example.com または @username@example.com"
						:max="128"
						@input="onChangeMisskeyUsername"
					/>
					<div v-if="misskeyUsernameError" style="margin-top: 8px; color: var(--MI_THEME-error); font-size: 0.9em;">
						<i class="ti ti-exclamation-triangle" style="margin-right: 4px;"></i>
						{{ misskeyUsernameError }}
					</div>
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
					<MkCaptcha v-model="captchaToken" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				</FormSection>
				<FormSection v-else-if="instance.enableTestcaptcha">
					<MkCaptcha v-model="captchaToken" provider="testcaptcha" :sitekey="null"/>
				</FormSection>

				<div class="_buttons">
					<MkButton :disabled="submitting || !canSubmit" primary rounded style="margin: 0 auto;" @click="submit">
						<template v-if="submitting"><i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i></template>
						<template v-else><i class="ti ti-send"></i> {{ i18n.ts._contactForm.submit }}</template>
					</MkButton>
				</div>
			</div>
		</div>

		<div v-else class="_gaps_m" style="text-align: center;">
			<div>
				<i class="ti ti-check" style="color: var(--MI_THEME-success); font-size: 3em;"></i>
			</div>
			<div>
				<h2>{{ i18n.ts._contactForm.submitComplete }}</h2>
				<p>{{ i18n.ts._contactForm.submitCompleteDescription }}</p>
			</div>

			<!-- 送信内容の表示 -->
			<div class="_gaps_m" :class="$style.previewContainer">
				<div :class="$style.previewCard">
					<h3 :class="$style.previewTitle">
						<i class="ti ti-mail-opened"></i> {{ i18n.ts._contactForm.submittedContent }}
					</h3>

					<div class="_gaps_s">
						<div :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.category }}:</strong>
							<span :class="$style.previewValue">{{ getCategoryLabel(submittedData.category) }}</span>
						</div>

						<div :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.subject }}:</strong>
							<div :class="$style.previewContent">
								{{ submittedData.subject }}
							</div>
						</div>

						<div :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.content }}:</strong>
							<div :class="[$style.previewContent, $style.previewContentText]">
								{{ submittedData.content }}
							</div>
						</div>

						<div v-if="submittedData.name" :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.name }}:</strong>
							<span :class="$style.previewValue">{{ submittedData.name }}</span>
						</div>

						<div :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.replyMethod }}:</strong>
							<span :class="$style.previewValue">{{ getReplyMethodText(submittedData.replyMethod) }}</span>
						</div>

						<div v-if="submittedData.replyMethod === 'email'" :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.email }}:</strong>
							<span :class="$style.previewValue">{{ submittedData.email }}</span>
						</div>

						<div v-if="submittedData.replyMethod === 'misskey'" :class="$style.previewField">
							<strong>{{ i18n.ts._contactForm.misskeyUsername }}:</strong>
							<span :class="$style.previewValue">
								<Mfm :text="`@${submittedData.misskeyUsername}`" :linkNavigationBehavior="'window'"/>
							</span>
						</div>

						<div :class="$style.previewTimestamp">
							<i class="ti ti-clock"></i>
							{{ i18n.ts._contactForm.submittedAt }}: {{ submittedAt }}
						</div>
					</div>
				</div>
			</div>

			<div>
				<MkButton inline @click="reset">{{ i18n.ts._contactForm.goToTop }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import FormSection from '@/components/form/section.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { useContactFormCategories } from '@/composables/useContactFormCategories.js';

// Dynamic category management
const { fetchCategories, getCategoryLabel, getDefaultCategory, categoryOptions } = useContactFormCategories();

// Form data
const category = ref('other');
const subject = ref('');
const content = ref('');
const name = ref('');
const replyMethod = ref<'email' | 'misskey'>('email');
const email = ref('');
const misskeyUsername = ref('');

// Email validation state
const emailState = ref<null | 'wait' | 'ok' | 'unavailable:format' | 'unavailable:disposable' | 'unavailable:banned' | 'unavailable:mx' | 'unavailable:smtp' | 'unavailable' | 'error'>(null);
let emailAbortController: AbortController | null = null;

// Misskey username validation state
const misskeyUsernameError = ref<string | null>(null);

// Submission state
const submitting = ref(false);
const isSubmitted = ref(false);
const submittedData = ref<any>({});
const submittedAt = ref('');

// CAPTCHA state
const captchaToken = ref<string | null>(null);

// Initialize categories and set default
onMounted(async () => {
	await fetchCategories();
	category.value = getDefaultCategory();

	// ログイン済みユーザーの場合、フォームに自動入力
	if ($i) {
		name.value = $i.name || $i.username;
		replyMethod.value = 'misskey';
		const host = $i.host || new URL(instance.uri).hostname;
		misskeyUsername.value = `${$i.username}@${host}`;
		email.value = $i.email || '';
	}
});

// Misskey username validation function
function onChangeMisskeyUsername(): void {
	if (misskeyUsername.value === '') {
		misskeyUsernameError.value = null;
		return;
	}

	// 先頭の@を取り除く（あってもなくても可）
	const username = misskeyUsername.value.trim().replace(/^@/, '');

	// username@domain形式の検証
	if (!username.includes('@')) {
		misskeyUsernameError.value = 'username@domain 形式で入力してください';
		return;
	}

	// @で分割して検証
	const parts = username.split('@');
	if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
		misskeyUsernameError.value = 'username@domain 形式で入力してください';
		return;
	}

	const [user, domain] = parts;

	// ユーザー名の形式チェック（英数字、アンダースコア、ハイフンのみ）
	if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
		misskeyUsernameError.value = 'ユーザー名は英数字、アンダースコア、ハイフンのみ使用できます';
		return;
	}

	// ドメインの基本的な形式チェック
	if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
		misskeyUsernameError.value = '有効なドメイン名を入力してください';
		return;
	}

	misskeyUsernameError.value = null;
}

// Email validation function (based on Signup implementation)
function onChangeEmail(): void {
	if (email.value === '') {
		emailState.value = null;
		return;
	}

	// 基本的なフォーマットチェックを先に実行（フロントエンド）
	const basicEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!basicEmailFormat.test(email.value)) {
		emailState.value = 'unavailable:format';
		return;
	}

	// Active Email Validationが有効な場合のみAPI呼び出し
	// （サーバー設定に応じて詳細検証をスキップ）
	if (!instance.enableActiveEmailValidation) {
		emailState.value = 'ok';
		return;
	}

	if (emailAbortController != null) {
		emailAbortController.abort();
	}
	emailState.value = 'wait';
	emailAbortController = new AbortController();

	misskeyApi('email-address/available', {
		emailAddress: email.value,
	}, undefined, emailAbortController.signal).then(result => {
		emailState.value = result.available ? 'ok' :
			result.reason === 'format' ? 'unavailable:format' :
			result.reason === 'disposable' ? 'unavailable:disposable' :
			result.reason === 'banned' ? 'unavailable:banned' :
			result.reason === 'mx' ? 'unavailable:mx' :
			result.reason === 'smtp' ? 'unavailable:smtp' :
			'unavailable';
	}).catch((err) => {
		if (err.name !== 'AbortError') {
			emailState.value = 'error';
		}
	});
}

// Validation
const canSubmit = computed(() => {
	if (!subject.value.trim()) return false;
	if (!content.value.trim() || content.value.length < 10) return false;
	if (replyMethod.value === 'email') {
		if (!email.value.trim()) return false;
		// メール検証が失敗している場合は送信不可
		if (emailState.value && emailState.value !== 'ok' && emailState.value !== 'wait') return false;
	}
	if (replyMethod.value === 'misskey') {
		if (!misskeyUsername.value.trim()) return false;
		if (misskeyUsernameError.value) return false;
	}

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

		await misskeyApi('contact-form/submit', payload);

		// 送信データを保存
		submittedData.value = {
			category: category.value,
			subject: subject.value,
			content: content.value,
			name: name.value,
			replyMethod: replyMethod.value,
			email: replyMethod.value === 'email' ? email.value : null,
			misskeyUsername: replyMethod.value === 'misskey' ? misskeyUsername.value : null,
		};
		submittedAt.value = new Date().toLocaleString('ja-JP');

		isSubmitted.value = true;
	} catch (error: any) {
		console.error('Contact form submission failed:', error);
		os.alert({
			type: 'error',
			text: error.message || i18n.ts.somethingHappened,
		});
	} finally {
		submitting.value = false;
	}
}

function getReplyMethodText(replyMethod: string): string {
	return replyMethod === 'email' ? i18n.ts._contactForm.replyByEmail : i18n.ts._contactForm.replyByMisskey;
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

	// 送信データもリセット
	submittedData.value = {};
	submittedAt.value = '';
}

definePage(() => ({
	title: i18n.ts._contactForm.contactUs,
	icon: 'ti ti-mail',
}));
</script>

<style lang="scss" module>
@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

// Preview container - responsive layout
.previewContainer {
	max-width: 1400px;
	margin: 24px auto;
	text-align: left;
	padding: 0 16px;

	@media (max-width: 1200px) {
		max-width: 1000px;
	}

	@media (max-width: 768px) {
		max-width: 100%;
		margin: 16px auto;
		padding: 0 12px;
	}

	@media (max-width: 480px) {
		padding: 0 8px;
		margin: 12px auto;
	}
}

.container {
	--MI_SPACER-w: 600px;
	--MI_SPACER-min: 20px;
}

// Preview card
.previewCard {
	padding: 20px;
	background: var(--MI_THEME-panel);
	border-radius: 12px;
	border: 1px solid var(--MI_THEME-divider);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

	@media (max-width: 768px) {
		padding: 16px;
		border-radius: 8px;
	}

	@media (max-width: 480px) {
		padding: 12px;
	}
}

// Preview title
.previewTitle {
	margin: 0 0 20px 0;
	text-align: center;
	color: var(--MI_THEME-fg);
	font-size: 1.2em;
	font-weight: 600;

	@media (max-width: 480px) {
		font-size: 1.1em;
		margin-bottom: 16px;
	}
}

// Preview field container
.previewField {
	margin-bottom: 12px;

	&:last-child {
		margin-bottom: 0;
	}

	strong {
		color: var(--MI_THEME-fg);
		font-weight: 600;
	}
}

// Preview field value (inline)
.previewValue {
	margin-left: 8px;
	color: var(--MI_THEME-fg);
}

// Preview content (block)
.previewContent {
	margin-top: 6px;
	padding: 12px;
	background: var(--MI_THEME-bg);
	border-radius: 6px;
	word-break: break-word;
	color: var(--MI_THEME-fg);
	border: 1px solid var(--MI_THEME-divider);

	@media (max-width: 480px) {
		padding: 10px;
	}
}

// Text content with specific styling
.previewContentText {
	white-space: pre-wrap;
	max-height: 300px;
	overflow-y: auto;
	line-height: 1.5;

	@media (max-width: 768px) {
		max-height: 250px;
	}

	@media (max-width: 480px) {
		max-height: 200px;
	}
}

// Timestamp styling
.previewTimestamp {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-top: 16px;
	padding-top: 12px;
	border-top: 1px solid var(--MI_THEME-divider);

	i {
		margin-right: 4px;
	}

	@media (max-width: 480px) {
		font-size: 0.85em;
	}
}

// Disabled contact form styling
.disabledContainer {
	text-align: center;
	padding: 40px 20px;

	@media (max-width: 480px) {
		padding: 30px 15px;
	}
}

.disabledIcon {
	color: var(--MI_THEME-error);
	font-size: 3em;
	margin-bottom: 20px;

	@media (max-width: 480px) {
		font-size: 2.5em;
		margin-bottom: 16px;
	}
}

.disabledTitle {
	color: var(--MI_THEME-fg);
	font-size: 1.4em;
	font-weight: 600;
	margin: 0 0 16px 0;

	@media (max-width: 480px) {
		font-size: 1.2em;
		margin-bottom: 12px;
	}
}

.disabledDescription {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
	line-height: 1.5;
	margin: 0;
	white-space: pre-line; // localeの\nを改行として表示

	@media (max-width: 480px) {
		font-size: 0.9em;
	}
}
</style>
