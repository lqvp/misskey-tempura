/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, computed, markRaw } from 'vue';
import type { Endpoints } from 'misskey-js';
import type { PaginatorCompatibleEndpoints } from '@/utility/paginator.js';
import { Paginator } from '@/utility/paginator.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

type HistoryEndpoint = 'following/history' | 'following/requests/history';
type HistoryItem = Endpoints[HistoryEndpoint]['res'][number];
type ActionType = HistoryItem['type'];

type ActionConfigItem = {
	icon: string;
	avatarUser: 'toUser' | 'fromUser';
	className: string;
	themeColor?: string;
	tabIcon: string;
};

export function useHistoryPage<
	T extends HistoryEndpoint,
	const A extends Record<string, any>,
	S extends string,
>(
	endpoint: T,
	actionConfig: A,
	i18nScope: S,
) {
	const tab = ref<keyof A | 'all'>('all');

	const params = computed(() => ({
		...(tab.value !== 'all' ? { type: tab.value } : {}),
	}));

	const paginator = markRaw(new Paginator(endpoint, { computedParams: params as any }));

	function getActionConfig(type: ActionType): ActionConfigItem {
		return actionConfig[type!] ?? {
			icon: 'ti ti-question',
			avatarUser: 'toUser',
			className: '',
			themeColor: 'accent',
			tabIcon: 'ti ti-question',
		};
	}

	const i18nBase = computed(() => {
		if (i18nScope === '_followHistory') {
			return i18n.ts._followHistory;
		} else {
			return i18n.ts._followRequestHistory;
		}
	});

	const deleteHistory = () => {
		os.confirm({
			type: 'warning',
			text: i18nBase.value.deleteConfirm,
		}).then(({ canceled }) => {
			if (canceled) return;

			os.apiWithDialog(endpoint, {
				delete: true,
			} as any).then(() => {
				paginator.reload();
			});
		});
	};

	const headerActions = computed(() => [{
		icon: 'ti ti-trash',
		text: i18nBase.value.deleteAll,
		handler: deleteHistory,
	}]);

	const headerTabs = computed(() => [
		{
			key: 'all',
			title: i18nBase.value.types.all,
			icon: endpoint === 'following/history' ? 'ti ti-history' : 'ti ti-history-toggle',
		},
		...Object.entries(actionConfig).map(([key, config]) => ({
			key,
			title: i18nBase.value.types[key],
			icon: config.tabIcon,
		})),
	]);

	return {
		tab,
		paginator,
		getActionConfig,
		headerActions,
		headerTabs,
	};
}
