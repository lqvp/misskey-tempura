<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-key"></i></template>
	<template #label>{{ i18n.ts.fixedInviteCode }}・{{ i18n.ts.signupPassphrase }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.fixedInviteCode || form.savedState.signupPassphrase?.trim()" #suffix>{{ i18n.ts.enabled }}</template>
	<template v-else #suffix>{{ i18n.ts.disabled }}</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkInput v-model="form.state.fixedInviteCode">
			<template #label>
				<span>{{ i18n.ts.fixedInviteCode }}</span>
				<span class="_beta">{{ i18n.ts.originalFeature }}</span>
			</template>
			<template #caption>{{ i18n.ts.fixedInviteCodeDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.signupPassphrase">
			<template #label>
				<span>{{ i18n.ts.signupPassphrase }}</span>
				<span class="_beta">{{ i18n.ts.originalFeature }}</span>
			</template>
			<template #caption>{{ i18n.ts.signupPassphraseDescription }}</template>
		</MkInput>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	fixedInviteCode: props.meta.fixedInviteCode ?? '',
	signupPassphrase: props.meta.signupPassphrase ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		fixedInviteCode: state.fixedInviteCode === '' ? null : state.fixedInviteCode,
		signupPassphrase: state.signupPassphrase === '' ? null : state.signupPassphrase,
	});
	fetchInstance(true);
});
</script>
