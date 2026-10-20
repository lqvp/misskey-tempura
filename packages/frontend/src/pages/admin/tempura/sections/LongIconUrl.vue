<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkSwitch v-model="enabled" @change="onChangeEnabled">
		<template #label>{{ i18n.ts._serverSettings.enableLongIconUrl }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
		<template #caption>{{ i18n.ts._serverSettings.enableLongIconUrlDescription }}</template>
	</MkSwitch>
	<div class="_gaps">
		<MkInput v-model="url">
			<template #label>
				<span>{{ i18n.ts._serverSettings.longIconUrl }}</span>
				<span class="_beta">{{ i18n.ts.originalFeature }}</span>
			</template>
		</MkInput>
		<MkButton v-if="url" primary @click="save">{{ i18n.ts.save }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const enabled = ref<boolean>(props.meta.enableLongIconUrl);
const url = ref<string | null>(props.meta.longIconUrl ?? null);

async function onChangeEnabled(v: boolean) {
	await os.apiWithDialog('admin/update-meta', { enableLongIconUrl: v });
	fetchInstance(true);
}

function save() {
	os.apiWithDialog('admin/update-meta', { longIconUrl: url.value }).then(() => {
		fetchInstance(true);
	});
}
</script>
EOF
