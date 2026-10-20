<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-mail"></i></template>
	<template #label>{{ i18n.ts._contactForm._settings.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.enableContactForm" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.enableContactForm">
			<template #label>{{ i18n.ts._contactForm._settings.enable }}</template>
			<template #caption>{{ i18n.ts._contactForm._settings.enableDescription }}</template>
		</MkSwitch>

		<MkInput v-model="form.state.contactFormLimit" type="number" :min="1" :max="10">
			<template #label>{{ i18n.ts._contactForm._settings.limit }}</template>
			<template #caption>{{ i18n.ts._contactForm._settings.limitDescription }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.contactFormRequireAuth">
			<template #label>{{ i18n.ts._contactForm._settings.requireAuth }}</template>
			<template #caption>{{ i18n.ts._contactForm._settings.requireAuthDescription }}</template>
		</MkSwitch>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	enableContactForm: props.meta.enableContactForm,
	contactFormLimit: props.meta.contactFormLimit,
	contactFormRequireAuth: props.meta.contactFormRequireAuth,
}, async (state) => {
	if (state.contactFormLimit < 1 || state.contactFormLimit > 10) {
		os.alert({ type: 'error', text: '制限値は1から10の間で設定してください' });
		throw new Error('invalid contactFormLimit');
	}
	await os.apiWithDialog('admin/update-meta', {
		enableContactForm: state.enableContactForm,
		contactFormLimit: state.contactFormLimit,
		contactFormRequireAuth: state.contactFormRequireAuth,
	});
	fetchInstance(true);
});
</script>
