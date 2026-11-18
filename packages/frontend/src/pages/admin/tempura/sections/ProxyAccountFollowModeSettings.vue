<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-ghost"></i></template>
	<template #label>{{ i18n.ts.proxyAccountFollowMode }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkInfo>{{ i18n.ts.proxyAccountDescription }}</MkInfo>

		<MkRadios v-model="form.state.followMode" :options="[
			{ value: 'always', label: i18n.ts._proxyAccountFollowMode.always },
			{ value: 'skipIfFollowed', label: i18n.ts._proxyAccountFollowMode.skipIfFollowed },
			{ value: 'disabled', label: i18n.ts._proxyAccountFollowMode.disabled },
		]">
			<template #label>{{ i18n.ts.proxyAccountFollowMode }}<span v-if="form.modifiedStates.followMode" class="_modified">{{ i18n.ts.modified }}</span></template>
			<template #caption>{{ i18n.ts.proxyAccountFollowMode_description }}</template>
		</MkRadios>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { useForm } from '@/composables/use-form.js';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkRadios from '@/components/MkRadios.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	followMode: props.meta.proxyAccountFollowMode,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		proxyAccountFollowMode: state.followMode,
	});
	fetchInstance(true);
});
</script>
