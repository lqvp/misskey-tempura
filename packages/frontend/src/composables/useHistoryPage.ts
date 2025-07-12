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

	function getActionText(type: ActionType, history: HistoryItem) {
		const sourceUser = history.fromUser?.name || history.fromUser?.username || '(unknown)';
		const targetUser = history.toUser?.name || history.toUser?.username || '(unknown)';

		return i18n.t(`${i18nScope}.${type! as string}` as any, { user: type!.startsWith('was') ? sourceUser : targetUser });
	}

	const deleteHistory = () => {
		os.confirm({
			type: 'warning',
			text: i18n.t(`${i18nScope}.deleteConfirm` as any),
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
		text: i18n.t(`${i18nScope}.deleteAll` as any),
		handler: deleteHistory,
	}]);

	const headerTabs = computed(() => [
		{
			key: 'all',
			title: i18n.t(`${i18nScope}.types.all` as any),
			icon: endpoint === 'following/history' ? 'ti ti-history' : 'ti ti-history-toggle',
		},
		...Object.entries(actionConfig).map(([key, config]) => ({
			key,
			title: i18n.t(`${i18nScope}.types.${key}` as any),
			icon: config.tabIcon,
		})),
	]);

	return {
		tab,
		paginator,
		getActionConfig,
		getActionText,
		headerActions,
		headerTabs,
	};
}
