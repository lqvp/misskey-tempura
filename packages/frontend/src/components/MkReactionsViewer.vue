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
		:noteId="props.noteId"
		:myReaction="props.myReaction"
		@reactionToggled="onMockToggleReaction"
	/>
	<slot v-if="hasMoreReactions" name="more"/>
</component>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { inject, watch, ref, computed } from 'vue';
import { TransitionGroup } from 'vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = withDefaults(defineProps<{
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: string[] | null;
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

const filteredReactions = computed(() => {
	if (visibleReactions.value == null) {
		// まだ取得が完了していない場合は全て表示（ちらつき防止）
		return _reactions.value;
	}
	return _reactions.value.filter(([reaction]) => visibleReactions.value?.has(reaction));
});

async function updateVisibility() {
	if (!prefer.s.reactionChecksMuting) {
		visibleReactions.value = new Set(Object.keys(props.reactions));
		return;
	}

	try {
		const reactionTypes = Object.keys(props.reactions);
		const promises = reactionTypes.map(type =>
			misskeyApi('notes/reactions', {
				noteId: props.noteId,
				type: type,
				limit: 1,
			}),
		);

		const results = await Promise.all(promises);

		const visible = new Set<string>();
		for (let i = 0; i < results.length; i++) {
			const users = results[i];
			if (users.length > 0) {
				visible.add(reactionTypes[i]);
			}
		}
		visibleReactions.value = visible;
	} catch (error) {
		console.error(error);
		// フォールバックとして全て表示
		visibleReactions.value = new Set(Object.keys(props.reactions));
	}
}

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - _reactions.value[i][1]));
}

function canReact(reaction: string) {
	if (!$i) return false;
	// TODO: CheckPermissions
	return !reaction.match(/@\w/) && (customEmojisMap.has(reaction) || isSupportedEmoji(reaction));
}

let isInitialReactionSet = false;

watch(() => props.reactions, (newSource) => {
	if (!isInitialReactionSet) {
		initialReactions.value = new Set(Object.keys(newSource));
		isInitialReactionSet = true;
	}
	if (Object.keys(newSource).length > 0) {
		updateVisibility();
	} else {
		visibleReactions.value = new Set();
	}

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

	if (props.myReaction && props.myReaction.length > 0) {
		// 自分のリアクションを全て表示に含める
		for (const myReaction of props.myReaction) {
			if (!newReactions.map(([x]) => x).includes(myReaction) && newSource[myReaction]) {
				newReactions.push([myReaction, newSource[myReaction]]);
			}
		}
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
