/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
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

	// Meta設定からカテゴリを取得
	const fetchCategories = async (): Promise<ContactFormCategory[]> => {
		if (loading.value) return categories.value;

		loading.value = true;
		try {
			const allCategories = instance.contactFormCategories;

			// contactFormCategoriesが存在し、配列の場合のみ処理
			if (allCategories && Array.isArray(allCategories)) {
			// 有効なカテゴリのみをフィルタリングして順序でソート
				const enabledCategories = allCategories
					.filter((cat: ContactFormCategory) => cat.enabled)
					.sort((a: ContactFormCategory, b: ContactFormCategory) => a.order - b.order);

				categories.value = enabledCategories;
				return enabledCategories;
			} else {
			// 設定が存在しない場合は空の配列を返す
				categories.value = [];
				return [];
			}
		} catch (error) {
			console.error('Failed to fetch contact form categories:', error);
			// エラーを再throwして呼び出し側でハンドリング
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
		return defaultCategory ? defaultCategory.key : 'other';
	};

	// 有効なカテゴリの選択肢を取得（Vue Select用）
	const categoryOptions = computed(() => {
		return categories.value.map(cat => ({
			value: cat.key,
			label: cat.text || getCategoryLabel(cat.key),
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
