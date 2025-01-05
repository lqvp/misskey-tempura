<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="src" :actions="headerActions" :tabs="$i ? headerTabs : headerTabsWhenNotLogin" :displayMyAvatar="true"/></template>
	<MkSpacer :contentMax="800">
		<MkHorizontalSwipe v-model:tab="src" :tabs="$i ? headerTabs : headerTabsWhenNotLogin">
			<div :key="src" ref="rootEl">
				<MkInfo v-if="isBasicTimeline(src) && !defaultStore.reactiveState.timelineTutorials.value[src]" style="margin-bottom: var(--MI-margin);" closable @close="closeTutorial()">
					{{ i18n.ts._timelineDescription[src] }}
				</MkInfo>
				<MkPostForm v-if="defaultStore.reactiveState.showFixedPostForm.value" :class="$style.postForm" class="post-form _panel" fixed style="margin-bottom: var(--MI-margin);"/>
				<div v-if="queue > 0" :class="$style.new"><button class="_buttonPrimary" :class="$style.newButton" @click="top()">{{ i18n.ts.newNoteRecived }}</button></div>
				<div :class="$style.tl">
					<MkTimeline
						ref="tlComponent"
						:key="src + withRenotes + withReplies + onlyFiles + withSensitive"
						:src="src.split(':')[0]"
						:list="src.split(':')[1]"
						:withRenotes="withRenotes"
						:withReplies="withReplies"
						:withSensitive="withSensitive"
						:onlyFiles="onlyFiles"
						:sound="true"
						@queue="queueUpdated"
					/>
				</div>
			</div>
		</MkHorizontalSwipe>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, watch, provide, shallowRef, ref, onMounted, onActivated } from 'vue';
import { scroll } from '@@/js/scroll.js';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import type { MenuItem } from '@/types/menu.js';
import type { BasicTimelineType } from '@/timelines.js';
import MkTimeline from '@/components/MkTimeline.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { antennasCache, userListsCache, favoritedChannelsCache } from '@/cache.js';
import { deviceKind } from '@/scripts/device-kind.js';
import { deepMerge } from '@/scripts/merge.js';
import { miLocalStorage } from '@/local-storage.js';
import { availableBasicTimelines, hasWithReplies, isAvailableBasicTimeline, isBasicTimeline, basicTimelineIconClass } from '@/timelines.js';
import { useRouter } from '@/router/supplier.js';

provide('shouldOmitHeaderTitle', true);

const tlComponent = shallowRef<InstanceType<typeof MkTimeline>>();
const rootEl = shallowRef<HTMLElement>();

const router = useRouter();

type TimelinePageSrc = BasicTimelineType | `list:${string}`;

const queue = ref(0);
const srcWhenNotSignin = ref<'local' | 'global'>(isAvailableBasicTimeline('local') ? 'local' : 'global');
const src = computed<TimelinePageSrc>({
	get: () => ($i ? defaultStore.reactiveState.tl.value.src : srcWhenNotSignin.value),
	set: (x) => saveSrc(x),
});
const withRenotes = computed<boolean>({
	get: () => defaultStore.reactiveState.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});

// computed内での無限ループを防ぐためのフラグ
const localSocialTLFilterSwitchStore = ref<'withReplies' | 'onlyFiles' | false>(
	defaultStore.reactiveState.tl.value.filter.withReplies ? 'withReplies' :
	defaultStore.reactiveState.tl.value.filter.onlyFiles ? 'onlyFiles' :
	false,
);

const withReplies = computed<boolean>({
	get: () => {
		if (!$i) return false;
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'onlyFiles') {
			return false;
		} else {
			return defaultStore.reactiveState.tl.value.filter.withReplies;
		}
	},
	set: (x) => saveTlFilter('withReplies', x),
});
const onlyFiles = computed<boolean>({
	get: () => {
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'withReplies') {
			return false;
		} else {
			return defaultStore.reactiveState.tl.value.filter.onlyFiles;
		}
	},
	set: (x) => saveTlFilter('onlyFiles', x),
});

watch([withReplies, onlyFiles], ([withRepliesTo, onlyFilesTo]) => {
	if (withRepliesTo) {
		localSocialTLFilterSwitchStore.value = 'withReplies';
	} else if (onlyFilesTo) {
		localSocialTLFilterSwitchStore.value = 'onlyFiles';
	} else {
		localSocialTLFilterSwitchStore.value = false;
	}
});

const withSensitive = computed<boolean>({
	get: () => defaultStore.reactiveState.tl.value.filter.withSensitive,
	set: (x) => saveTlFilter('withSensitive', x),
});

const remoteLocalTimelineEnable1 = ref(defaultStore.state.remoteLocalTimelineEnable1);
const remoteLocalTimelineEnable2 = ref(defaultStore.state.remoteLocalTimelineEnable2);
const remoteLocalTimelineEnable3 = ref(defaultStore.state.remoteLocalTimelineEnable3);
const remoteLocalTimelineEnable4 = ref(defaultStore.state.remoteLocalTimelineEnable4);
const remoteLocalTimelineEnable5 = ref(defaultStore.state.remoteLocalTimelineEnable5);

watch(src, () => {
	queue.value = 0;
});

function queueUpdated(q: number): void {
	queue.value = q;
}

function top(): void {
	if (rootEl.value) scroll(rootEl.value, { top: 0 });
}

async function chooseList(ev: MouseEvent): Promise<void> {
	const lists = await userListsCache.fetch();
	const items: MenuItem[] = [
		...lists.map(list => ({
			type: 'link' as const,
			text: list.name,
			to: `/timeline/list/${list.id}`,
		})),
		(lists.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link' as const,
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/my/lists',
		},
	];
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

async function chooseAntenna(ev: MouseEvent): Promise<void> {
	const antennas = await antennasCache.fetch();
	const items: MenuItem[] = [
		...antennas.map(antenna => ({
			type: 'link' as const,
			text: antenna.name,
			indicate: antenna.hasUnreadNote,
			to: `/timeline/antenna/${antenna.id}`,
		})),
		(antennas.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link' as const,
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/my/antennas',
		},
	];
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

async function chooseChannel(ev: MouseEvent): Promise<void> {
	const channels = await favoritedChannelsCache.fetch();
	const items: MenuItem[] = [
		...channels.map(channel => {
			const lastReadedAt = miLocalStorage.getItemAsJson(`channelLastReadedAt:${channel.id}`) ?? null;
			const hasUnreadNote = (lastReadedAt && channel.lastNotedAt) ? Date.parse(channel.lastNotedAt) > lastReadedAt : !!(!lastReadedAt && channel.lastNotedAt);

			return {
				type: 'link' as const,
				text: channel.name,
				indicate: hasUnreadNote,
				to: `/channels/${channel.id}`,
			};
		}),
		(channels.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link',
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/channels',
		},
	];
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

function saveSrc(newSrc: TimelinePageSrc): void {
	const out = deepMerge({ src: newSrc }, defaultStore.state.tl);

	if (newSrc.startsWith('userList:')) {
		const id = newSrc.substring('userList:'.length);
		out.userList = defaultStore.reactiveState.pinnedUserLists.value.find(l => l.id === id) ?? null;
	}

	defaultStore.set('tl', out);
	if (['local', 'global'].includes(newSrc)) {
		srcWhenNotSignin.value = newSrc as 'local' | 'global';
	}
}

function saveTlFilter(key: keyof typeof defaultStore.state.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		const out = deepMerge({ filter: { [key]: newValue } }, defaultStore.state.tl);
		defaultStore.set('tl', out);
	}
}

async function timetravel(): Promise<void> {
	const { canceled, result: date } = await os.inputDate({
		title: i18n.ts.date,
	});
	if (canceled) return;

	tlComponent.value.timetravel(date);
}

function focus(): void {
	tlComponent.value.focus();
}

function closeTutorial(): void {
	if (!isBasicTimeline(src.value)) return;
	const before = defaultStore.state.timelineTutorials;
	before[src.value] = true;
	defaultStore.set('timelineTutorials', before);
}

function switchTlIfNeeded() {
	if (isBasicTimeline(src.value) && !isAvailableBasicTimeline(src.value)) {
		src.value = availableBasicTimelines()[0];
	}
}

onMounted(() => {
	switchTlIfNeeded();
});
onActivated(() => {
	switchTlIfNeeded();
});

const headerActions = computed(() => {
	const tmp = [
		{
			icon: 'ti ti-dots',
			text: i18n.ts.options,
			handler: (ev) => {
				const menuItems: MenuItem[] = [];

				menuItems.push({
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				});

				if (isBasicTimeline(src.value) && hasWithReplies(src.value)) {
					menuItems.push({
						type: 'switch',
						text: i18n.ts.showRepliesToOthersInTimeline,
						ref: withReplies,
						disabled: onlyFiles,
					});
				}

				menuItems.push({
					type: 'switch',
					text: i18n.ts.withSensitive,
					ref: withSensitive,
				}, {
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
					disabled: isBasicTimeline(src.value) && hasWithReplies(src.value) ? withReplies : false,
				});

				os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
			},
		},
	];
	if (deviceKind === 'desktop') {
		tmp.unshift({
			icon: 'ti ti-refresh',
			text: i18n.ts.reload,
			handler: (ev: Event) => {
				tlComponent.value?.reloadTimeline();
			},
		});
	}
	return tmp;
});

// タブの表示制御用の関数を作成
function isTabVisible(key: string): boolean {
	switch (key) {
		case 'followingsUpdates':
			return !defaultStore.makeGetterSetter('hideFollowingsUpdates').get();
		case 'followFeed':
			return !defaultStore.makeGetterSetter('hideFollowFeed').get();
		case 'lists':
			return !defaultStore.makeGetterSetter('hideLists').get();
		case 'antennas':
			return !defaultStore.makeGetterSetter('hideAntennas').get();
		case 'channel':
			return !defaultStore.makeGetterSetter('hideChannel').get();
		default:
			return true;
	}
}

// headerTabs の計算式を修正
const headerTabs = computed(() => {
	const tabs: Tab[] = [];

	// ピン留めされたユーザーリストのタブを追加
	if (!defaultStore.makeGetterSetter('hideLists').get()) {
		tabs.push(...defaultStore.reactiveState.pinnedUserLists.value.map(l => ({
			key: 'list:' + l.id,
			title: l.name,
			icon: 'ti ti-star',
			iconOnly: true,
		})));
	}

	// 基本タイムラインのタブを追加
	tabs.push(...availableBasicTimelines().map(tl => ({
		key: tl,
		title: i18n.ts._timelines[tl],
		icon: basicTimelineIconClass(tl),
		iconOnly: true,
	})));

	tabs.push(...(remoteLocalTimelineEnable1.value ? [{
		key: 'custom-timeline-1',
		title: defaultStore.state.remoteLocalTimelineName1,
		icon: 'ti ti-plus',
		iconOnly: true,
	}] : []), ...(remoteLocalTimelineEnable2.value ? [{
		key: 'custom-timeline-2',
		title: defaultStore.state.remoteLocalTimelineName2,
		icon: 'ti ti-plus',
		iconOnly: true,
	}] : []), ...(remoteLocalTimelineEnable3.value ? [{
		key: 'custom-timeline-3',
		title: defaultStore.state.remoteLocalTimelineName3,
		icon: 'ti ti-plus',
		iconOnly: true,
	}] : []), ...(remoteLocalTimelineEnable4.value ? [{
		key: 'custom-timeline-4',
		title: defaultStore.state.remoteLocalTimelineName4,
		icon: 'ti ti-plus',
		iconOnly: true,
	}] : []), ...(remoteLocalTimelineEnable5.value ? [{
		key: 'custom-timeline-5',
		title: defaultStore.state.remoteLocalTimelineName5,
		icon: 'ti ti-plus',
		iconOnly: true,
	}] : []));

	// 追加のタブを条件付きで追加
	if (isTabVisible('followingsUpdates')) {
		tabs.push({
			title: i18n.ts.followingsUpdates,
			icon: 'ti ti-users',
			iconOnly: true,
			onClick: () => { router.push('/my/followings-updates'); },
		});
	}

	if (isTabVisible('followFeed')) {
		tabs.push({
			icon: 'ti ti-user-check',
			title: i18n.ts.followFeed,
			iconOnly: true,
			onClick: () => router.push('/following-feed'),
		});
	}

	if (isTabVisible('lists')) {
		tabs.push({
			icon: 'ti ti-list',
			title: i18n.ts.lists,
			iconOnly: true,
			onClick: chooseList,
		});
	}

	if (isTabVisible('antennas')) {
		tabs.push({
			icon: 'ti ti-antenna',
			title: i18n.ts.antennas,
			iconOnly: true,
			onClick: chooseAntenna,
		});
	}

	if (isTabVisible('channel')) {
		tabs.push({
			icon: 'ti ti-device-tv',
			title: i18n.ts.channel,
			iconOnly: true,
			onClick: chooseChannel,
		});
	}

	return tabs;
});

const headerTabsWhenNotLogin = computed(() => [...availableBasicTimelines().map(tl => ({
	key: tl,
	title: i18n.ts._timelines[tl],
	icon: basicTimelineIconClass(tl),
	iconOnly: true,
}))] as Tab[]);

definePageMetadata(() => ({
	title: i18n.ts.timeline,
	icon: isBasicTimeline(src.value) ? basicTimelineIconClass(src.value) : 'ti ti-home',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--MI-margin));
	}
}

.newButton {
	display: block;
	margin: var(--MI-margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: 32px;
}

.postForm {
	border-radius: var(--MI-radius);
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
