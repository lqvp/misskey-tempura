/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import { defaultStore } from '@/store.js';
import { deepMerge } from '@/scripts/merge.js';
import { PageHeaderItem } from '@/types/page-header.js';
import { i18n } from '@/i18n.js';
import { popupMenu } from '@/os.js';

export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
export const followersTab = 'followers' as const;
export type FollowingFeedTab = typeof followingTab | typeof mutualsTab | typeof followersTab;

export function createOptions(): PageHeaderItem {
	const {
		userList,
		withNonPublic,
		withQuotes,
		withBots,
		withReplies,
		onlyFiles,
	} = createModel();

	return {
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: ev =>
			popupMenu([
				{
					type: 'switch',
					text: i18n.ts.showNonPublicNotes,
					ref: withNonPublic,
					disabled: userList.value === 'followers',
				},
				{
					type: 'switch',
					text: i18n.ts.showQuotes,
					ref: withQuotes,
				},
				{
					type: 'switch',
					text: i18n.ts.showBots,
					ref: withBots,
				},
				{
					type: 'switch',
					text: i18n.ts.showReplies,
					ref: withReplies,
					disabled: onlyFiles,
				},
				{
					type: 'divider',
				},
				{
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
					disabled: withReplies,
				},
			], ev.currentTarget ?? ev.target),
	};
}

export function createModel() {
	const userList = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.userList,
		set: value => saveFollowingFilter('userList', value),
	});

	const withNonPublic = computed({
		get: () => {
			if (userList.value === 'followers') return false;
			return defaultStore.reactiveState.followingFeed.value.withNonPublic;
		},
		set: value => saveFollowingFilter('withNonPublic', value),
	});
	const withQuotes = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.withQuotes,
		set: value => saveFollowingFilter('withQuotes', value),
	});
	const withBots = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.withBots,
		set: value => saveFollowingFilter('withBots', value),
	});
	const withReplies = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.withReplies,
		set: value => saveFollowingFilter('withReplies', value),
	});
	const onlyFiles = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.onlyFiles,
		set: value => saveFollowingFilter('onlyFiles', value),
	});

	const remoteWarningDismissed = computed({
		get: () => defaultStore.reactiveState.followingFeed.value.remoteWarningDismissed,
		set: value => saveFollowingFilter('remoteWarningDismissed', value),
	});

	return {
		userList,
		withNonPublic,
		withQuotes,
		withBots,
		withReplies,
		onlyFiles,
		remoteWarningDismissed,
	};
}

// Based on timeline.saveTlFilter()
function saveFollowingFilter<Key extends keyof typeof defaultStore.state.followingFeed>(key: Key, value: (typeof defaultStore.state.followingFeed)[Key]) {
	const out = deepMerge({ [key]: value }, defaultStore.state.followingFeed);
	return defaultStore.set('followingFeed', out);
}
