<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-language"></i></template>
	<template #label>DeepL Free Mode<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.deeplFreeMode" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.deeplFreeMode">
			<template #label>{{ i18n.ts.deeplFreeMode }}<span v-if="form.modifiedStates.deeplFreeMode" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts.deeplFreeModeDescription }}</template>
		</MkSwitch>

		<MkInput v-if="form.state.deeplFreeMode" v-model="form.state.deeplFreeInstance" :placeholder="'example.com/translate'">
			<template #prefix><i class="ph-globe-simple ph-bold ph-lg"></i></template>
			<template #label>DeepLX-JS URL<span v-if="form.modifiedStates.deeplFreeInstance" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts.deeplFreeModeDescription }}</template>
		</MkInput>
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
	deeplFreeMode: props.meta.deeplFreeMode,
	deeplFreeInstance: props.meta.deeplFreeInstance ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		deeplFreeMode: state.deeplFreeMode,
		deeplFreeInstance: state.deeplFreeInstance,
	});
	fetchInstance(true);
});
</script>
