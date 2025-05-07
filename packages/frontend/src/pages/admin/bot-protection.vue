<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-shield"></i></template>
	<template #label>{{ i18n.ts.botProtection }}</template>
	<template v-if="botProtectionForm.savedState.provider === 'hcaptcha'" #suffix>hCaptcha</template>
	<template v-else-if="botProtectionForm.savedState.provider === 'mcaptcha'" #suffix>mCaptcha</template>
	<template v-else-if="botProtectionForm.savedState.provider === 'recaptcha'" #suffix>reCAPTCHA</template>
	<template v-else-if="botProtectionForm.savedState.provider === 'turnstile'" #suffix>Turnstile</template>
	<template v-else-if="botProtectionForm.savedState.provider === 'fc'" #suffix>FriendlyCaptcha</template>
	<template v-else-if="botProtectionForm.savedState.provider === 'testcaptcha'" #suffix>testCaptcha</template>
	<template v-else #suffix>{{ i18n.ts.none }} ({{ i18n.ts.notRecommended }})</template>
	<template #footer>
		<MkFormFooter :canSaving="canSaving" :form="botProtectionForm"/>
	</template>

	<div class="_gaps_m">
		<MkRadios v-model="botProtectionForm.state.provider">
			<option value="none">{{ i18n.ts.none }} ({{ i18n.ts.notRecommended }})</option>
			<option value="hcaptcha">hCaptcha</option>
			<option value="mcaptcha">mCaptcha</option>
			<option value="recaptcha">reCAPTCHA</option>
			<option value="turnstile">Turnstile</option>
			<option value="fc">FriendlyCaptcha</option>
			<option value="testcaptcha">testCaptcha</option>
		</MkRadios>

		<template v-if="botProtectionForm.state.provider === 'hcaptcha'">
			<MkInput v-model="botProtectionForm.state.hcaptchaSiteKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.hcaptchaSiteKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.hcaptchaSecretKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.hcaptchaSecretKey }}</template>
			</MkInput>
			<FormSlot v-if="botProtectionForm.state.hcaptchaSiteKey">
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha
					v-model="captchaResult"
					provider="hcaptcha"
					:sitekey="botProtectionForm.state.hcaptchaSiteKey"
					:secretKey="botProtectionForm.state.hcaptchaSecretKey"
				/>
			</FormSlot>
			<MkInfo>
				<div :class="$style.captchaInfoMsg">
					<div>{{ i18n.ts._captcha.testSiteKeyMessage }}</div>
					<div>
						<span>ref: </span><a href="https://docs.hcaptcha.com/#integration-testing-test-keys" target="_blank">hCaptcha Developer Guide</a>
					</div>
				</div>
			</MkInfo>
		</template>

		<template v-else-if="botProtectionForm.state.provider === 'mcaptcha'">
			<MkInput v-model="botProtectionForm.state.mcaptchaSiteKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.mcaptchaSiteKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.mcaptchaSecretKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.mcaptchaSecretKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.mcaptchaInstanceUrl" debounce>
				<template #prefix><i class="ti ti-link"></i></template>
				<template #label>{{ i18n.ts.mcaptchaInstanceUrl }}</template>
			</MkInput>
			<FormSlot v-if="botProtectionForm.state.mcaptchaSiteKey && botProtectionForm.state.mcaptchaInstanceUrl">
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha
					v-model="captchaResult"
					provider="mcaptcha"
					:sitekey="botProtectionForm.state.mcaptchaSiteKey"
					:secretKey="botProtectionForm.state.mcaptchaSecretKey"
					:instanceUrl="botProtectionForm.state.mcaptchaInstanceUrl"
				/>
			</FormSlot>
		</template>

		<template v-else-if="botProtectionForm.state.provider === 'recaptcha'">
			<MkInput v-model="botProtectionForm.state.recaptchaSiteKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.recaptchaSiteKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.recaptchaSecretKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.recaptchaSecretKey }}</template>
			</MkInput>
			<FormSlot v-if="botProtectionForm.state.recaptchaSiteKey">
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha
					v-model="captchaResult"
					provider="recaptcha"
					:sitekey="botProtectionForm.state.recaptchaSiteKey"
					:secretKey="botProtectionForm.state.recaptchaSecretKey"
				/>
			</FormSlot>
			<MkInfo>
				<div :class="$style.captchaInfoMsg">
					<div>{{ i18n.ts._captcha.testSiteKeyMessage }}</div>
					<div>
						<span>ref: </span>
						<a
							href="https://developers.google.com/recaptcha/docs/faq?hl=ja#id-like-to-run-automated-tests-with-recaptcha.-what-should-i-do"
							target="_blank"
						>reCAPTCHA FAQ</a>
					</div>
				</div>
			</MkInfo>
		</template>

		<template v-else-if="botProtectionForm.state.provider === 'turnstile'">
			<MkInput v-model="botProtectionForm.state.turnstileSiteKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.turnstileSiteKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.turnstileSecretKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.turnstileSecretKey }}</template>
			</MkInput>
			<FormSlot v-if="botProtectionForm.state.turnstileSiteKey">
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha
					v-model="captchaResult"
					provider="turnstile"
					:sitekey="botProtectionForm.state.turnstileSiteKey"
					:secretKey="botProtectionForm.state.turnstileSecretKey"
				/>
			</FormSlot>
			<MkInfo>
				<div :class="$style.captchaInfoMsg">
					<div>
						{{ i18n.ts._captcha.testSiteKeyMessage }}
					</div>
					<div>
						<span>ref: </span><a href="https://developers.cloudflare.com/turnstile/troubleshooting/testing/" target="_blank">Cloudflare Docs</a>
					</div>
				</div>
			</MkInfo>
		</template>

		<template v-else-if="botProtectionForm.state.provider === 'fc'">
			<MkInput v-model="botProtectionForm.state.fcSiteKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.hcaptchaSiteKey }}</template>
			</MkInput>
			<MkInput v-model="botProtectionForm.state.fcSecretKey" debounce>
				<template #prefix><i class="ti ti-key"></i></template>
				<template #label>{{ i18n.ts.hcaptchaSecretKey }}</template>
			</MkInput>
			<FormSlot v-if="botProtectionForm.state.fcSiteKey && botProtectionForm.state.fcSecretKey">
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha
					v-model="captchaResult"
					provider="fc"
					:sitekey="botProtectionForm.state.fcSiteKey"
					:secretKey="botProtectionForm.state.fcSecretKey"
				/>
			</FormSlot>
		</template>

		<template v-else-if="botProtectionForm.state.provider === 'testcaptcha'">
			<MkInfo warn><span v-html="i18n.ts.testCaptchaWarning"></span></MkInfo>
			<FormSlot>
				<template #label>{{ i18n.ts._captcha.verify }}</template>
				<MkCaptcha v-model="captchaResult" provider="testcaptcha" :sitekey="null"/>
			</FormSlot>
		</template>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkRadios from '@/components/MkRadios.vue';
import MkInput from '@/components/MkInput.vue';
import FormSlot from '@/components/form/slot.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { useForm } from '@/use/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import type { ApiWithDialogCustomErrors } from '@/os.js';

const MkCaptcha = defineAsyncComponent(() => import('@/components/MkCaptcha.vue'));

const errorHandler: ApiWithDialogCustomErrors = {
	// 検証リクエストそのものに失敗
	'0f4fe2f1-2c15-4d6e-b714-efbfcde231cd': {
		title: i18n.ts._captcha._error._requestFailed.title,
		text: i18n.ts._captcha._error._requestFailed.text,
	},
	// 検証リクエストの結果が不正
	'c41c067f-24f3-4150-84b2-b5a3ae8c2214': {
		title: i18n.ts._captcha._error._verificationFailed.title,
		text: i18n.ts._captcha._error._verificationFailed.text,
	},
	// 不明なエラー
	'f868d509-e257-42a9-99c1-42614b031a97': {
		title: i18n.ts._captcha._error._unknown.title,
		text: i18n.ts._captcha._error._unknown.text,
	},
};

const captchaResult = ref<string | null>(null);

const meta = await misskeyApi('admin/captcha/current');
const botProtectionForm = useForm({
	provider: meta.enableHcaptcha
		? 'hcaptcha'
		: meta.enableRecaptcha
			? 'recaptcha'
			: meta.enableTurnstile
				? 'turnstile'
				: meta.enableMcaptcha
					? 'mcaptcha'
					: meta.enableFC
						? 'fc'
						: null,
	hcaptchaSiteKey: meta.hcaptchaSiteKey,
	hcaptchaSecretKey: meta.hcaptchaSecretKey,
	mcaptchaSiteKey: meta.mcaptchaSiteKey,
	mcaptchaSecretKey: meta.mcaptchaSecretKey,
	mcaptchaInstanceUrl: meta.mcaptchaInstanceUrl,
	recaptchaSiteKey: meta.recaptchaSiteKey,
	recaptchaSecretKey: meta.recaptchaSecretKey,
	turnstileSiteKey: meta.turnstileSiteKey,
	turnstileSecretKey: meta.turnstileSecretKey,
	fcSiteKey: meta.fcSiteKey,
	fcSecretKey: meta.fcSecretKey,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableHcaptcha: state.provider === 'hcaptcha',
		hcaptchaSiteKey: state.hcaptchaSiteKey,
		hcaptchaSecretKey: state.hcaptchaSecretKey,
		enableMcaptcha: state.provider === 'mcaptcha',
		mcaptchaSiteKey: state.mcaptchaSiteKey,
		mcaptchaSecretKey: state.mcaptchaSecretKey,
		mcaptchaInstanceUrl: state.mcaptchaInstanceUrl,
		enableRecaptcha: state.provider === 'recaptcha',
		recaptchaSiteKey: state.recaptchaSiteKey,
		recaptchaSecretKey: state.recaptchaSecretKey,
		enableTurnstile: state.provider === 'turnstile',
		turnstileSiteKey: state.turnstileSiteKey,
		turnstileSecretKey: state.turnstileSecretKey,
		enableFC: state.provider === 'fc',
		fcSiteKey: state.fcSiteKey,
		fcSecretKey: state.fcSecretKey,
	});
	fetchInstance(true);
});

</script>

<style lang="scss" module>
.captchaInfoMsg {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
