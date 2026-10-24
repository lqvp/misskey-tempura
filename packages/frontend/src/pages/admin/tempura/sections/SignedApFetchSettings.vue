<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-shield-lock"></i></template>
	<template #label>{{ i18n.ts._serverSettings.requireSignedApFetch }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.requireSignedApFetch" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.requireSignedApFetch">
			<template #label>{{ i18n.ts._serverSettings.requireSignedApFetch }}<span v-if="form.modifiedStates.requireSignedApFetch" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverSettings.requireSignedApFetch_description }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.allowUnregisteredApSignerVerification">
			<template #label>{{ i18n.ts._serverSettings.allowUnregisteredApSignerVerification }}<span v-if="form.modifiedStates.allowUnregisteredApSignerVerification" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverSettings.allowUnregisteredApSignerVerification_description }}</template>
		</MkSwitch>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	requireSignedApFetch: props.meta.requireSignedApFetch ?? false,
	allowUnregisteredApSignerVerification: props.meta.allowUnregisteredApSignerVerification ?? false,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		requireSignedApFetch: state.requireSignedApFetch,
		allowUnregisteredApSignerVerification: state.allowUnregisteredApSignerVerification,
	});
	fetchInstance(true);
});
</script>
