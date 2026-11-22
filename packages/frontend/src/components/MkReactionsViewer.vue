<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="prefer.s.animation ? TransitionGroup : 'div'"
	:enterActiveClass="$style.transition_x_enterActive"
	:leaveActiveClass="$style.transition_x_leaveActive"
	:enterFromClass="$style.transition_x_enterFrom"
	:leaveToClass="$style.transition_x_leaveTo"
	:moveClass="$style.transition_x_move"
	tag="div" :class="$style.root"
>
	<XReaction
		v-for="[reaction, count] in filteredReactions"
		:key="reaction"
		:reaction="reaction"
		:reactionEmojis="props.reactionEmojis"
		:count="count"
		:isInitial="initialReactions.has(reaction)"
		:note="props.note"
		:noteId="props.noteId"
		:myReaction="props.myReaction"
		@reactionToggled="onMockToggleReaction"
	/>
	<slot v-if="hasMoreReactions" name="more"></slot>
</component>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { inject, watch, ref, computed } from 'vue';
import { TransitionGroup } from 'vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ReactionVisibilityCache } from '@/utility/reaction-visibility.js';
import { useGlobalEvent } from '@/events.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const initialReactions = ref(new Set<string>());

const _reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);
const visibleReactions = ref<Set<string> | null>(null);
const visibilityCache = new ReactionVisibilityCache(async type => {
	const users = await misskeyApi('notes/reactions', { noteId: props.noteId, type, limit: 1 });
	return users.length > 0;
});
let visibilityRevision = 0;

const filteredReactions = computed(() => {
	if (visibleReactions.value == null) {
		// まだ取得が完了していない場合は全て表示（ちらつき防止）
		return _reactions.value;
	}
	return _reactions.value.filter(([reaction]) => visibleReactions.value?.has(reaction));
});

async function updateVisibility() {
	const revision = ++visibilityRevision;
	if (!prefer.s.reactionChecksMuting) {
		visibleReactions.value = new Set(Object.keys(props.reactions));
		return;
	}

	try {
		const visible = await visibilityCache.getVisible(props.reactions);
		if (revision === visibilityRevision) visibleReactions.value = visible;
	} catch (error) {
		console.error(error);
		// フォールバックとして全て表示
		if (revision === visibilityRevision) visibleReactions.value = new Set(Object.keys(props.reactions));
	}
}

watch([() => props.noteId, () => prefer.s.reactionChecksMuting], () => {
	visibilityCache.clear();
	updateVisibility();
});

useGlobalEvent('userRelationsChanged', () => {
	visibilityCache.clear();
	updateVisibility();
});

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - _reactions.value[i][1]));
}

function canReact(reaction: string) {
	if (!$i) return false;
	// TODO: CheckPermissions
	return isLocalCustomEmojiReaction(reaction)
		? customEmojisMap.has(getEmojiNameFromReaction(reaction))
		: isSupportedEmoji(reaction);
}

let isInitialReactionSet = false;

watch(() => props.reactions, (newSource) => {
	if (!isInitialReactionSet) {
		initialReactions.value = new Set(Object.keys(newSource));
		isInitialReactionSet = true;
	}
	updateVisibility();

	let newReactions: [string, number][] = [];
	hasMoreReactions.value = Object.keys(newSource).length > props.maxNumber;

	const existingReactions = _reactions.value.filter(([reaction]) => reaction in newSource && newSource[reaction] !== 0);
	for (const r of existingReactions) {
		r[1] = newSource[r[0]];
	}

	const newReactionsNames = existingReactions.map(([x]) => x);
	const sortedNew = Object.entries(newSource)
		.sort(([emojiA, countA], [emojiB, countB]) => {
			if (prefer.s.showAvailableReactionsFirstInNote) {
				if (!canReact(emojiA) && canReact(emojiB)) return 1;
				if (canReact(emojiA) && !canReact(emojiB)) return -1;
				return countB - countA;
			} else {
				return countB - countA;
			}
		})
		.filter(([y]) => !newReactionsNames.includes(y));

	newReactions = [...existingReactions, ...sortedNew].slice(0, props.maxNumber);

	if (props.myReaction && !newReactions.some(([x]) => x === props.myReaction)) {
		newReactions.push([props.myReaction, newSource[props.myReaction]]);
	}

	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
