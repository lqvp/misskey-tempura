<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkSpacer :contentMax="700">
	<MkFoldableSection>
		<template #header>{{ i18n.ts._role.manual + " " + i18n.ts.roles }}</template>
		<div :class="$style.roleGrid">
			<MkRolePreview v-for="role in rolesManual" :key="role.id" :role="role" :forModeration="false"/>
		</div>
	</MkFoldableSection>
	<MkFoldableSection>
		<template #header>{{ i18n.ts._role.conditional + " " + i18n.ts.roles }}</template>
		<div :class="$style.roleGrid">
			<MkRolePreview v-for="role in rolesConditional" :key="role.id" :role="role" :forModeration="false"/>
		</div>
	</MkFoldableSection>
	<MkFoldableSection>
		<template #header>{{ i18n.ts.community + " " + i18n.ts.roles }}</template>
		<div class="_gaps_s">
			<MkRolePreview v-for="role in rolesCommunity" :key="role.id" :role="role" :forModeration="false"/>
		</div>
	</MkFoldableSection>
</MkSpacer>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkRolePreview from '@/components/MkRolePreview.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n';

const rolesManual = $ref();
let rolesConditional = $ref();
let rolesCommunity = ref<Misskey.entities.Role[] | null>(null);

misskeyApi('roles/list').then(res => {
	const roles.value = res.sort((a, b) => b.displayOrder - a.displayOrder);
	rolesManual = roles.filter(x => x.target === 'manual' && x.permissionGroup !== 'Community');
	rolesConditional = roles.filter(x => x.target === 'conditional' && x.permissionGroup !== 'Community');
	rolesCommunity = roles.filter(x => x.permissionGroup === 'Community');
});
</script>

