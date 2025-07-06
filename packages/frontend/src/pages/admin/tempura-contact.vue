<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div :class="$style.root" class="_gaps">
			<MkTip k="contactForms">
				{{ i18n.ts._contactForm.list }}
			</MkTip>

			<div :class="$style.inputs" class="_gaps">
				<MkSelect v-model="status" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.state }}</template>
					<option value="all">{{ i18n.ts.all }}</option>
					<option value="pending">{{ i18n.ts._contactForm.pending }}</option>
					<option value="in_progress">{{ i18n.ts._contactForm.inProgress }}</option>
					<option value="resolved">{{ i18n.ts._contactForm.resolved }}</option>
					<option value="closed">{{ i18n.ts._contactForm.closed }}</option>
				</MkSelect>
				<MkSelect v-model="category" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts._contactForm.category }}</template>
					<option value="all">{{ i18n.ts.all }}</option>
					<option value="bug_report">{{ i18n.ts._contactForm.bugReport }}</option>
					<option value="feature_request">{{ i18n.ts._contactForm.featureRequest }}</option>
					<option value="account_issue">{{ i18n.ts._contactForm.accountIssue }}</option>
					<option value="technical_issue">{{ i18n.ts._contactForm.technicalIssue }}</option>
					<option value="content_issue">{{ i18n.ts._contactForm.contentIssue }}</option>
					<option value="other">{{ i18n.ts._contactForm.other }}</option>
				</MkSelect>
				<MkInput v-model="assignedUserId" style="margin: 0; flex: 1;" type="text" :spellcheck="false" :placeholder="'@username'">
					<template #label>{{ i18n.ts._contactForm.assignedUser }}</template>
				</MkInput>
			</div>

			<MkPagination v-slot="{items}" :paginator="paginator">
				<div class="_gaps">
					<XContactForm v-for="contactForm in items" :key="contactForm.id" :contact-form="contactForm" @updated="onContactFormUpdated"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, markRaw } from 'vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkPagination from '@/components/MkPagination.vue';
import XContactForm from '@/components/XContactForm.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const status = ref('all');
const category = ref('all');
const assignedUserId = ref('');

const paginator = markRaw(new Paginator('admin/contact-form/list', {
	limit: 10,
	computedParams: computed(() => ({
		status: status.value === 'all' ? undefined : status.value,
		category: category.value === 'all' ? undefined : category.value,
		assignedUserId: assignedUserId.value || undefined,
	})),
}));

function onContactFormUpdated(contactFormId: string) {
	paginator.reload();
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._contactForm.list,
	icon: 'ti ti-mail',
}));
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: stretch;
}

.inputs {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
}
</style>
