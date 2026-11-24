<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker
			path="/admin/tempura-admin"
			:label="i18n.ts.originalFeature"
			:keywords="['tempura', 'fork', 'original', 'admin']"
			icon="ti ti-git-fork"
			:inlining="[
				'tempuraAdminRegistration',
				'tempuraAdminFederation',
				'tempuraAdminModeration',
				'tempuraAdminIntegrations',
				'tempuraAdminAppearance',
			]"
		>
			<MkSuspense :p="init">
				<div v-if="meta" class="_gaps_m">
					<RegistrationCategory :meta="meta"/>
					<FederationCategory :meta="meta"/>
					<ModerationCategory :meta="meta"/>
					<IntegrationsCategory :meta="meta"/>
					<AppearanceCategory :meta="meta"/>
				</div>
			</MkSuspense>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import RegistrationCategory from './tempura/categories/RegistrationCategory.vue';
import FederationCategory from './tempura/categories/FederationCategory.vue';
import ModerationCategory from './tempura/categories/ModerationCategory.vue';
import IntegrationsCategory from './tempura/categories/IntegrationsCategory.vue';
import AppearanceCategory from './tempura/categories/AppearanceCategory.vue';
import type * as Misskey from 'misskey-js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const meta = ref<Misskey.Endpoints['admin/meta']['res'] | null>(null);

async function init() {
	meta.value = await misskeyApi('admin/meta');
}

definePage(() => ({
	title: i18n.ts.originalFeature,
	icon: 'ti ti-git-fork',
}));
</script>
