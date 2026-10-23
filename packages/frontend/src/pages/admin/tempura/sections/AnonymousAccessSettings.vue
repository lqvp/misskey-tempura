<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-eye-off"></i></template>
	<template #label>{{ i18n.ts._serverSettings.anonymousVisitorAccess }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

	<div class="_gaps_m">
		<div v-for="group in groups" :key="group.key" class="_gaps_s">
			<MkSelect :modelValue="groupState(group)" :items="groupStateItems" @update:modelValue="onGroupChange(group, $event)">
				<template #label>{{ group.label }}</template>
			</MkSelect>
			<div class="_gaps_s">
				<MkSwitch v-for="flag in group.flags" :key="flag.key" :modelValue="flagValues[flag.key]" @update:modelValue="onFlagChange(flag.key, $event)">
					<template #label>{{ flag.label }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template #caption>{{ flag.caption }}</template>
				</MkSwitch>
			</div>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { reactive } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

type FlagKey =
	| 'allowAnonymousStats'
	| 'allowAnonymousOnlineUsersCount'
	| 'allowAnonymousChartActiveUsers'
	| 'allowAnonymousChartApRequest'
	| 'allowAnonymousChartDrive'
	| 'allowAnonymousChartFederation'
	| 'allowAnonymousChartInstance'
	| 'allowAnonymousChartNotes'
	| 'allowAnonymousChartUsers'
	| 'allowAnonymousFederationUsers'
	| 'allowAnonymousFederationInstances'
	| 'allowAnonymousFederationStats'
	| 'allowAnonymousShowInstance'
	| 'allowAnonymousReplies'
	| 'allowAnonymousRenotes'
	| 'allowAnonymousQuotes'
	| 'allowAnonymousFeatured'
	| 'allowAnonymousLocalTimeline';

type FlagDef = { key: FlagKey; label: string; caption: string };

const S = i18n.ts._serverSettings;

const groups: { key: string; label: string; flags: FlagDef[] }[] = [
	{
		key: 'stats',
		label: S.anonymousVisitorAccessStats,
		flags: [
			{ key: 'allowAnonymousStats', label: S.allowAnonymousStats, caption: S.allowAnonymousStats_description },
			{ key: 'allowAnonymousOnlineUsersCount', label: S.allowAnonymousOnlineUsersCount, caption: S.allowAnonymousOnlineUsersCount_description },
			{ key: 'allowAnonymousChartActiveUsers', label: S.allowAnonymousChartActiveUsers, caption: S.allowAnonymousChartActiveUsers_description },
			{ key: 'allowAnonymousChartApRequest', label: S.allowAnonymousChartApRequest, caption: S.allowAnonymousChartApRequest_description },
			{ key: 'allowAnonymousChartDrive', label: S.allowAnonymousChartDrive, caption: S.allowAnonymousChartDrive_description },
			{ key: 'allowAnonymousChartFederation', label: S.allowAnonymousChartFederation, caption: S.allowAnonymousChartFederation_description },
			{ key: 'allowAnonymousChartInstance', label: S.allowAnonymousChartInstance, caption: S.allowAnonymousChartInstance_description },
			{ key: 'allowAnonymousChartNotes', label: S.allowAnonymousChartNotes, caption: S.allowAnonymousChartNotes_description },
			{ key: 'allowAnonymousChartUsers', label: S.allowAnonymousChartUsers, caption: S.allowAnonymousChartUsers_description },
		],
	},
	{
		key: 'federation',
		label: S.anonymousVisitorAccessFederation,
		flags: [
			{ key: 'allowAnonymousFederationUsers', label: S.allowAnonymousFederationUsers, caption: S.allowAnonymousFederationUsers_description },
			{ key: 'allowAnonymousFederationInstances', label: S.allowAnonymousFederationInstances, caption: S.allowAnonymousFederationInstances_description },
			{ key: 'allowAnonymousFederationStats', label: S.allowAnonymousFederationStats, caption: S.allowAnonymousFederationStats_description },
			{ key: 'allowAnonymousShowInstance', label: S.allowAnonymousShowInstance, caption: S.allowAnonymousShowInstance_description },
		],
	},
	{
		key: 'notes',
		label: S.anonymousVisitorAccessNotes,
		flags: [
			{ key: 'allowAnonymousReplies', label: S.allowAnonymousReplies, caption: S.allowAnonymousReplies_description },
			{ key: 'allowAnonymousRenotes', label: S.allowAnonymousRenotes, caption: S.allowAnonymousRenotes_description },
			{ key: 'allowAnonymousQuotes', label: S.allowAnonymousQuotes, caption: S.allowAnonymousQuotes_description },
			{ key: 'allowAnonymousFeatured', label: S.allowAnonymousFeatured, caption: S.allowAnonymousFeatured_description },
			{ key: 'allowAnonymousLocalTimeline', label: S.allowAnonymousLocalTimeline, caption: S.allowAnonymousLocalTimeline_description },
		],
	},
];

const flagValues = reactive<Record<FlagKey, boolean>>({
	allowAnonymousStats: props.meta.allowAnonymousStats ?? false,
	allowAnonymousOnlineUsersCount: props.meta.allowAnonymousOnlineUsersCount ?? false,
	allowAnonymousChartActiveUsers: props.meta.allowAnonymousChartActiveUsers ?? false,
	allowAnonymousChartApRequest: props.meta.allowAnonymousChartApRequest ?? false,
	allowAnonymousChartDrive: props.meta.allowAnonymousChartDrive ?? false,
	allowAnonymousChartFederation: props.meta.allowAnonymousChartFederation ?? false,
	allowAnonymousChartInstance: props.meta.allowAnonymousChartInstance ?? false,
	allowAnonymousChartNotes: props.meta.allowAnonymousChartNotes ?? false,
	allowAnonymousChartUsers: props.meta.allowAnonymousChartUsers ?? false,
	allowAnonymousFederationUsers: props.meta.allowAnonymousFederationUsers ?? false,
	allowAnonymousFederationInstances: props.meta.allowAnonymousFederationInstances ?? false,
	allowAnonymousFederationStats: props.meta.allowAnonymousFederationStats ?? false,
	allowAnonymousShowInstance: props.meta.allowAnonymousShowInstance ?? false,
	allowAnonymousReplies: props.meta.allowAnonymousReplies ?? false,
	allowAnonymousRenotes: props.meta.allowAnonymousRenotes ?? false,
	allowAnonymousQuotes: props.meta.allowAnonymousQuotes ?? false,
	allowAnonymousFeatured: props.meta.allowAnonymousFeatured ?? false,
	allowAnonymousLocalTimeline: props.meta.allowAnonymousLocalTimeline ?? false,
});

type GroupState = 'allOn' | 'allOff' | 'custom';

const groupStateItems = [
	{ label: S.anonymousAccessGroupAllOn, value: 'allOn' as const },
	{ label: S.anonymousAccessGroupAllOff, value: 'allOff' as const },
	{ label: S.anonymousAccessGroupCustom, value: 'custom' as const },
];

function groupState(group: { flags: FlagDef[] }): GroupState {
	const values = group.flags.map(f => flagValues[f.key]);
	if (values.every(v => v)) return 'allOn';
	if (values.every(v => !v)) return 'allOff';
	return 'custom';
}

let saveQueue: Promise<void> = Promise.resolve();

async function save(partial: Partial<Record<FlagKey, boolean>>) {
	// admin/update-meta の要求を直列化し、後の要求が先に保存される競合を防ぐ。
	// 失敗しても後続の保存は続行できるようにする。
	const request = saveQueue.then(async () => {
		await os.apiWithDialog('admin/update-meta', partial);
		await fetchInstance(true);
	});
	saveQueue = request.catch(() => {});
	await request;
}

async function onFlagChange(key: FlagKey, value: boolean) {
	const previous = flagValues[key];
	flagValues[key] = value;
	try {
		await save({ [key]: value });
	} catch {
		// 保存失敗時は画面の状態をサーバー設定と一致させるため元に戻す
		flagValues[key] = previous;
	}
}

async function onGroupChange(group: { flags: FlagDef[] }, state: GroupState) {
	// custom は表示上の状態なので、選択しても個別フラグは変更しない
	if (state === 'custom') return;
	const value = state === 'allOn';
	const partial: Partial<Record<FlagKey, boolean>> = {};
	const previous: Partial<Record<FlagKey, boolean>> = {};
	for (const flag of group.flags) {
		previous[flag.key] = flagValues[flag.key];
		flagValues[flag.key] = value;
		partial[flag.key] = value;
	}
	try {
		await save(partial);
	} catch {
		Object.assign(flagValues, previous);
	}
}
</script>
