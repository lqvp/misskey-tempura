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
				// フォールバック：デフォルトカテゴリを返す
				const fallbackCategories = [
					{ key: 'general', text: '一般', enabled: true, order: 1, isDefault: true },
					{ key: 'bug_report', text: 'バグ報告', enabled: true, order: 2, isDefault: false },
					{ key: 'feature_request', text: '機能要望', enabled: true, order: 3, isDefault: false },
					{ key: 'account_issue', text: 'アカウント関連', enabled: true, order: 4, isDefault: false },
					{ key: 'technical_issue', text: '技術的な問題', enabled: true, order: 5, isDefault: false },
					{ key: 'content_issue', text: 'コンテンツ関連', enabled: true, order: 6, isDefault: false },
					{ key: 'other', text: 'その他', enabled: true, order: 7, isDefault: false },
				];
				categories.value = fallbackCategories;
				return fallbackCategories;
			}
		} catch (error) {
			console.error('Failed to fetch contact form categories:', error);
			// フォールバック：デフォルトカテゴリを返す
			const fallbackCategories = [
				{ key: 'general', text: '一般', enabled: true, order: 1, isDefault: true },
				{ key: 'bug_report', text: 'バグ報告', enabled: true, order: 2, isDefault: false },
				{ key: 'feature_request', text: '機能要望', enabled: true, order: 3, isDefault: false },
				{ key: 'account_issue', text: 'アカウント関連', enabled: true, order: 4, isDefault: false },
				{ key: 'technical_issue', text: '技術的な問題', enabled: true, order: 5, isDefault: false },
				{ key: 'content_issue', text: 'コンテンツ関連', enabled: true, order: 6, isDefault: false },
				{ key: 'other', text: 'その他', enabled: true, order: 7, isDefault: false },
			];
			categories.value = fallbackCategories;
			return fallbackCategories;
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
