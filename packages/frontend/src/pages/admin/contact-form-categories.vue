<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div :class="$style.root" class="_gaps">
			<MkTip k="contactFormCategories">
				{{ i18n.ts._contactForm.categoryManagement }}
			</MkTip>

			<div class="_gaps">
				<div class="_buttons">
					<MkButton primary @click="addCategory">
						<i class="ti ti-plus"></i> {{ i18n.ts.add }}
					</MkButton>
					<MkButton :disabled="!hasChanges" @click="saveCategories">
						<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
					</MkButton>
					<MkButton @click="resetCategories">
						<i class="ti ti-restore"></i> {{ i18n.ts._contactForm.reset }}
					</MkButton>
				</div>

				<div class="_gaps_s">
					<div v-for="(category, index) in categories" :key="category.key" :class="$style.categoryItem">
						<div :class="$style.categoryHeader">
							<div :class="$style.dragHandle">
								<i class="ti ti-grip-vertical"></i>
							</div>
							<MkInput v-model="category.key" :placeholder="'category_key'" style="flex: 1;"/>
							<MkInput v-model="category.text" :placeholder="'表示テキスト'" style="flex: 1; margin-left: 8px;"/>
							<MkSwitch v-model="category.enabled"/>
							<MkButton danger @click="removeCategory(index)">
								<i class="ti ti-trash"></i>
							</MkButton>
						</div>
						<div :class="$style.categoryOptions">
							<MkSwitch v-model="category.isDefault" @change="onDefaultChange(index)">
								<template #label>{{ i18n.ts._contactForm.defaultCategory }}</template>
							</MkSwitch>
							<MkInput v-model.number="category.order" type="number" :placeholder="'表示順序'" style="width: 100px;"/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';

interface ContactFormCategory {
	key: string;
	text: string;
	enabled: boolean;
	order: number;
	isDefault: boolean;
}

const categories = ref<ContactFormCategory[]>([]);
const originalCategories = ref<ContactFormCategory[]>([]);

const hasChanges = computed(() => {
	return JSON.stringify(categories.value) !== JSON.stringify(originalCategories.value);
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

async function loadCategories() {
	try {
		const loadedCategories = instance.contactFormCategories;

		categories.value = [...loadedCategories];
		originalCategories.value = JSON.parse(JSON.stringify(loadedCategories));
	} catch (error) {
		console.error('Failed to load categories:', error);
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

async function saveCategories() {
	try {
		// バリデーション
		if (categories.value.length === 0) {
			os.alert({
				type: 'error',
				text: '最低1つのカテゴリが必要です',
			});
			return;
		}

		// デフォルトカテゴリが1つ選択されているかチェック
		const defaultCategories = categories.value.filter(cat => cat.isDefault);
		if (defaultCategories.length !== 1) {
			os.alert({
				type: 'error',
				text: 'デフォルトカテゴリを1つ選択してください',
			});
			return;
		}

		// キーの重複チェック
		const keys = categories.value.map(cat => cat.key);
		if (new Set(keys).size !== keys.length) {
			os.alert({
				type: 'error',
				text: 'カテゴリキーが重複しています',
			});
			return;
		}

		await misskeyApi('admin/update-meta', {
			contactFormCategories: categories.value,
		});

		originalCategories.value = JSON.parse(JSON.stringify(categories.value));

		os.success();
	} catch (error) {
		console.error('Failed to save categories:', error);
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

function addCategory() {
	const newOrder = Math.max(...categories.value.map(cat => cat.order), 0) + 1;
	categories.value.push({
		key: `custom_${Date.now()}`,
		text: 'カスタムカテゴリ',
		enabled: true,
		order: newOrder,
		isDefault: false,
	});
}

function removeCategory(index: number) {
	categories.value.splice(index, 1);
}

function onDefaultChange(index: number) {
	// 他のデフォルトフラグをクリア
	categories.value.forEach((cat, i) => {
		if (i !== index) {
			cat.isDefault = false;
		}
	});
}

function resetCategories() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	}).then(({ canceled }) => {
		if (!canceled) {
			loadCategories();
		}
	});
}

onMounted(() => {
	loadCategories();
});

definePage(() => ({
	title: i18n.ts._contactForm.categoryManagement || 'カテゴリ管理',
	icon: 'ti ti-forms',
}));
</script>

<style lang="scss" module>
.root {
}

.categoryItem {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI_THEME-radius);
	padding: 16px;
	background: var(--MI_THEME-panel);
}

.categoryHeader {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 8px;
}

.dragHandle {
	cursor: grab;
	color: var(--MI_THEME-fg);
	opacity: 0.6;

	&:hover {
		opacity: 1;
	}
}

.categoryOptions {
	display: flex;
	align-items: center;
	gap: 16px;

	label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9em;

		input[type="checkbox"] {
			margin: 0;
		}
	}
}
</style>
