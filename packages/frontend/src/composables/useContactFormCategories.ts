/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, watch } from 'vue';
import { instance } from '@/instance.js';

export interface ContactFormCategory {
	key: string;
	text: string;
	enabled: boolean;
	order: number;
	isDefault: boolean;
}

export function useContactFormCategories() {
	const categories = ref<ContactFormCategory[]>([]);
	const loading = ref(false);
	const DEFAULT_CATEGORY_KEY = 'other';

	// Meta設定からカテゴリを取得
	const fetchCategories = async (): Promise<ContactFormCategory[]> => {
		if (loading.value) {
			// 既に実行中の場合は現在のPromiseを返す
			await new Promise<void>(resolve => {
				const unwatch = watch(loading, (newValue) => {
					if (!newValue) {
						unwatch();
						resolve();
					}
				});
			});
			return categories.value;
		}
		loading.value = true;
		try {
			if (!instance) {
				throw new Error('Instance is not available');
			}
			const allCategories = instance.contactFormCategories;
			if (allCategories && Array.isArray(allCategories)) {
				const enabledCategories = allCategories
					.filter((cat: ContactFormCategory) => cat.enabled)
					.sort((a: ContactFormCategory, b: ContactFormCategory) => a.order - b.order);
				categories.value = enabledCategories;
				return enabledCategories;
			} else {
				categories.value = [];
				return [];
			}
		} catch (error) {
			console.error('Failed to fetch contact form categories:', error);
			throw error;
		} finally {
			loading.value = false;
		}
	};

	// カテゴリのラベル取得
	const getCategoryLabel = (key: string): string => {
		const category = categories.value.find(cat => cat.key === key);
		return category ? category.text : key;
	};

	// デフォルトカテゴリを取得
	const getDefaultCategory = (): string => {
		const defaultCategory = categories.value.find(cat => cat.isDefault);
		return defaultCategory ? defaultCategory.key : DEFAULT_CATEGORY_KEY;
	};

	// 有効なカテゴリの選択肢を取得（Vue Select用）
	const categoryOptions = computed(() => {
		return categories.value.map(cat => ({
			value: cat.key,
			label: cat.text,
		}));
	});

	return {
		categories,
		loading,
		fetchCategories,
		getCategoryLabel,
		getDefaultCategory,
		categoryOptions,
	};
}
