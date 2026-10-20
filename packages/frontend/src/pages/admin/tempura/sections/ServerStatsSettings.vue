<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-server-2"></i></template>
	<template #label>{{ i18n.ts._serverStats.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkInfo>{{ i18n.ts._serverStats.masterToggleHint }}</MkInfo>

		<MkSwitch v-model="form.state.enableCpuModel">
			<template #label>{{ i18n.ts._serverStats.enableCpuModel }}<span v-if="form.modifiedStates.enableCpuModel" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.enableCpuModelDescription }}</template>
		</MkSwitch>

		<MkInput v-if="form.state.enableCpuModel" v-model="form.state.customCpuModel">
			<template #label>{{ i18n.ts._serverStats.customCpuModel }}<span v-if="form.modifiedStates.customCpuModel" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.customCpuModelDescription }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.enableCpuCore">
			<template #label>{{ i18n.ts._serverStats.enableCpuCore }}<span v-if="form.modifiedStates.enableCpuCore" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.enableCpuCoreDescription }}</template>
		</MkSwitch>

		<MkInput v-if="form.state.enableCpuCore" v-model="form.state.customCpuCore" type="number">
			<template #label>{{ i18n.ts._serverStats.customCpuCore }}<span v-if="form.modifiedStates.customCpuCore" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.customCpuCoreDescription }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.enableMemTotal">
			<template #label>{{ i18n.ts._serverStats.enableMemTotal }}<span v-if="form.modifiedStates.enableMemTotal" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.enableMemTotalDescription }}</template>
		</MkSwitch>

		<MkInput v-if="form.state.enableMemTotal" v-model="form.state.customMemTotal" type="number">
			<template #label>{{ i18n.ts._serverStats.customMemTotal }}<span v-if="form.modifiedStates.customMemTotal" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.customMemTotalDescription }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.enableFsTotal">
			<template #label>{{ i18n.ts._serverStats.enableFsTotal }}<span v-if="form.modifiedStates.enableFsTotal" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.enableFsTotalDescription }}</template>
		</MkSwitch>

		<MkInput v-if="form.state.enableFsTotal" v-model="form.state.customFsTotal" type="number">
			<template #label>{{ i18n.ts._serverStats.customFsTotal }}<span v-if="form.modifiedStates.customFsTotal" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts._serverStats.customFsTotalDescription }}</template>
		</MkInput>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	enableCpuModel: props.meta.enableCpuModel,
	customCpuModel: props.meta.customCpuModel,
	enableCpuCore: props.meta.enableCpuCore,
	customCpuCore: props.meta.customCpuCore,
	enableMemTotal: props.meta.enableMemTotal,
	customMemTotal: props.meta.customMemTotal,
	enableFsTotal: props.meta.enableFsTotal,
	customFsTotal: props.meta.customFsTotal,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableCpuModel: state.enableCpuModel,
		customCpuModel: state.customCpuModel,
		enableCpuCore: state.enableCpuCore,
		customCpuCore: state.customCpuCore,
		enableMemTotal: state.enableMemTotal,
		customMemTotal: state.customMemTotal,
		enableFsTotal: state.enableFsTotal,
		customFsTotal: state.customFsTotal,
	});
	fetchInstance(true);
});
</script>
