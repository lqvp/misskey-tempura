<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-user-star"></i></template>
	<template #label>{{ i18n.ts._extraSettings.defaultFollowedUsers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

	<div class="_gaps">
		<MkTextarea v-model="defaultFollowedUsers">
			<template #label>{{ i18n.ts._extraSettings.defaultFollowedUsers }}</template>
			<template #caption>{{ i18n.ts._extraSettings.defaultFollowedUsersDescription }}</template>
		</MkTextarea>
		<MkTextarea v-model="forciblyFollowedUsers">
			<template #label>{{ i18n.ts._extraSettings.forciblyFollowedUsers }}</template>
			<template #caption>{{ i18n.ts._extraSettings.forciblyFollowedUsersDescription }}</template>
		</MkTextarea>
		<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const defaultFollowedUsers = ref<string>(props.meta.defaultFollowedUsers.join('\n'));
const forciblyFollowedUsers = ref<string>(props.meta.forciblyFollowedUsers.join('\n'));

function save() {
	os.apiWithDialog('admin/update-meta', {
		defaultFollowedUsers: defaultFollowedUsers.value.split('\n'),
		forciblyFollowedUsers: forciblyFollowedUsers.value.split('\n'),
	}, undefined, {
		'bcf088ec-fec5-42d0-8b9e-16d3b4797a4d': {
			text: i18n.ts._extraSettings.defaultFollowedUsersDuplicated,
		},
	}).then(() => {
		fetchInstance(true);
	});
}
</script>
EOF
