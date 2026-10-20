<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-mail"></i></template>
	<template #label>Email Domain Settings<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.emailWhitelist" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.emailWhitelist">
			<template #label>Enable Whitelist Mode</template>
		</MkSwitch>

		<MkTextarea v-model="form.state.bannedEmailDomains">
			<template #label>
				<span v-if="form.state.emailWhitelist">Whitelist Email Domains List</span>
				<span v-else>Banned Email Domains List</span>
			</template>
		</MkTextarea>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	emailWhitelist: props.meta.emailWhitelist,
	bannedEmailDomains: props.meta.bannedEmailDomains?.join('\n') || '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		emailWhitelist: state.emailWhitelist,
		bannedEmailDomains: state.bannedEmailDomains.split('\n'),
	});
	fetchInstance(true);
});
</script>
