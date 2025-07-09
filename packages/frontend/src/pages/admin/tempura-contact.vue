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
				<MkSelect v-model="status" style="margin: 0; flex: 1;" @update:modelValue="reload">
					<template #label>{{ i18n.ts.state }}</template>
					<option value="all">{{ i18n.ts.all }}</option>
					<option value="pending">{{ i18n.ts._contactForm.pending }}</option>
					<option value="in_progress">{{ i18n.ts._contactForm.inProgress }}</option>
					<option value="resolved">{{ i18n.ts._contactForm.resolved }}</option>
					<option value="closed">{{ i18n.ts._contactForm.closed }}</option>
				</MkSelect>
				<MkSelect v-model="category" style="margin: 0; flex: 1;" @update:modelValue="reload">
					<template #label>{{ i18n.ts._contactForm.category }}</template>
					<option value="all">{{ i18n.ts.all }}</option>
					<option v-for="option in categoryOptions" :key="option.value" :value="option.value">
						{{ option.label }}
					</option>
				</MkSelect>
				<MkInput v-model="assignedUserId" style="margin: 0; flex: 1;" type="text" :spellcheck="false" :placeholder="'@username'" @update:modelValue="reload">
					<template #label>{{ i18n.ts._contactForm.assignedUser }}</template>
				</MkInput>
			</div>

			<div v-if="loading" class="loading">
				<MkLoading/>
			</div>
			<div v-else class="_gaps">
				<MkContactForm v-for="contactForm in items" :key="contactForm.id" :contactForm="contactForm" @updated="onContactFormUpdated"/>

				<div v-if="items.length === 0" class="empty">
					<div style="text-align: center; color: var(--MI_THEME-fg);">
						{{ i18n.ts._contactForm.noContactForms }}
					</div>
				</div>

				<div v-if="hasMore" class="more">
					<MkButton style="margin: 0 auto;" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkPagination from '@/components/MkPagination.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkContactForm from '@/components/MkContactForm.vue';
import { useContactFormCategories } from '@/composables/useContactFormCategories.js';

// Dynamic category management
const { fetchCategories, categoryOptions } = useContactFormCategories();

const loading = ref(false);
const status = ref('all');
const category = ref('all');
const assignedUserId = ref('');

// Initialize categories
onMounted(async () => {
	await fetchCategories();
});

const items = ref([]);
const offset = ref(0);
const limit = 10;
const hasMore = ref(true);

async function loadItems(reset = false) {
	loading.value = true;

	try {
		if (reset) {
			offset.value = 0;
			items.value = [];
		}

		const params = {
			limit: limit,
			offset: offset.value,
			status: status.value === 'all' ? undefined : status.value,
			category: category.value === 'all' ? undefined : category.value,
			assignedUserId: assignedUserId.value || undefined,
		};

		const result = await misskeyApi('admin/contact-form/list', params);

		if (reset) {
			items.value = result;
		} else {
			items.value.push(...result);
		}

		hasMore.value = result.length === limit;
		offset.value += result.length;
	} catch (error) {
		console.error('Failed to load contact forms:', error);
	} finally {
		loading.value = false;
	}
}

function reload() {
	loadItems(true);
}

function loadMore() {
	loadItems(false);
}

function onContactFormUpdated(contactFormId: string) {
	reload();
}

onMounted(() => {
	loadItems(true);
});

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

.loading, .empty, .more {
	text-align: center;
	padding: 16px;
}
</style>
