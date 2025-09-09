<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<header :class="$style.root">
	<div v-if="mock" :class="$style.name">
		<MkUserName :user="note.user"/>
	</div>
	<MkA v-else v-user-preview="note.user.id" :class="$style.name" :to="userPage(note.user)">
		<MkUserName :user="note.user"/>
	</MkA>
	<div v-if="note.user.isBot" :class="$style.isBot">bot</div>
	<div :class="$style.username"><MkAcct :user="note.user"/></div>
	<div v-if="note.user.badgeRoles" :class="$style.badgeRoles">
		<img v-for="(role, i) in note.user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.badgeRole" :src="role.iconUrl!"/>
	</div>
	<div :class="$style.info">
		<div v-if="mock">
			<MkTime :time="note.createdAt" colored/>
		</div>
		<MkA v-else :to="notePage(note)">
			<MkTime :time="note.createdAt" colored/>
		</MkA>
		<span v-if="note.visibility === 'public' && note.dontShowOnLtl === true" style="margin-left: 0.5em;" :title="i18n.ts._visibility['public_non_ltl']">
			<i v-tooltip="i18n.ts._visibility['public_non_ltl']" class="ti ti-broadcast"></i>
		</span>
		<span v-else-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
			<i v-if="note.visibility === 'home'" v-tooltip="i18n.ts._visibility[note.visibility]" class="ti ti-home"></i>
			<i v-else-if="note.visibility === 'followers'" v-tooltip="i18n.ts._visibility[note.visibility]" class="ti ti-lock"></i>
			<i v-else-if="note.visibility === 'specified' && !note.visibleUserIds?.length" ref="specified" class="ti ti-eye-off"></i>
			<i v-else-if="note.visibility === 'specified'" ref="specified" v-tooltip="i18n.ts._visibility[note.visibility]" class="ti ti-mail"></i>
		</span>
		<span v-if="note.reactionAcceptance != null" style="margin-left: 0.5em;" :class="{ [$style.danger]: ['nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote', 'likeOnly'].includes(<string>note.reactionAcceptance) }" :title="i18n.ts.reactionAcceptance">
			<i v-if="note.reactionAcceptance === 'likeOnlyForRemote'" v-tooltip="i18n.ts.likeOnlyForRemote" class="ti ti-heart-plus"></i>
			<i v-else-if="note.reactionAcceptance === 'nonSensitiveOnly'" v-tooltip="i18n.ts.nonSensitiveOnly" class="ti ti-icons"></i>
			<i v-else-if="note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote'" v-tooltip="i18n.ts.nonSensitiveOnlyForLocalLikeOnlyForRemote" class="ti ti-heart-plus"></i>
			<i v-else-if="note.reactionAcceptance === 'likeOnly'" v-tooltip="i18n.ts.likeOnly" class="ti ti-heart"></i>
		</span>
		<span v-if="note.localOnly" style="margin-left: 0.5em;"><i v-tooltip="i18n.ts._visibility['disableFederation']" class="ti ti-rocket-off"></i></span>
		<span v-if="note.deliveryTargets && (note.deliveryTargets.mode === 'include' || note.deliveryTargets.hosts?.length)" style="margin-left: 0.5em;">
			<i v-if="note.deliveryTargets.mode === 'include'" ref="deliveryTargetsIcon" class="ti ti-list-check"></i>
			<i v-else ref="deliveryTargetsIcon" class="ti ti-list-details"></i>
		</span>
		<span v-if="note.channel" style="margin-left: 0.5em;"><i v-tooltip="note.channel.name" class="ti ti-device-tv"></i></span>
		<span v-if="note.deleteAt" style="margin-left: 0.5em;" :title="i18n.tsx.noteDeletationAt({ time: dateTimeFormat.format(new Date(note.deleteAt)) })"><i class="ti ti-bomb"></i></span>
	</div>
</header>
</template>

<script lang="ts" setup>
import { inject, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkDeliveryTargetsDisplay from './MkDeliveryTargetsDisplay.vue';
import { i18n } from '@/i18n.js';
import { notePage } from '@/filters/note.js';
import { userPage } from '@/filters/user.js';
import { dateTimeFormat } from '@/utility/intl-const.js';
import { DI } from '@/di.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';

const props = defineProps<{
	note: Misskey.entities.Note & {
		isSchedule?: boolean,
		deliveryTargets?: {
			mode: 'include' | 'exclude';
			hosts: string[];
		} | null;
	};
	scheduled?: boolean;
}>();

const mock = inject(DI.mock, false);

const deliveryTargetsIcon = useTemplateRef('deliveryTargetsIcon');

// 配信先サーバーのツールチップを設定
if (props.note.deliveryTargets && (props.note.deliveryTargets.mode === 'include' || props.note.deliveryTargets.hosts?.length)) {
	useTooltip(deliveryTargetsIcon, (showing) => {
		if (deliveryTargetsIcon.value == null) return;

		const { dispose } = os.popup(MkDeliveryTargetsDisplay, {
			showing,
			mode: props.note.deliveryTargets!.mode,
			hosts: props.note.deliveryTargets!.hosts || [],
			targetElement: deliveryTargetsIcon.value,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: baseline;
	white-space: nowrap;
}

.name {
	flex-shrink: 1;
	display: block;
	margin: 0 .5em 0 0;
	padding: 0;
	overflow: hidden;
	font-size: 1em;
	font-weight: bold;
	text-decoration: none;
	text-overflow: ellipsis;

	&:hover {
		text-decoration: underline;
	}
}

.isBot {
	flex-shrink: 0;
	align-self: center;
	margin: 0 .5em 0 0;
	padding: 1px 6px;
	font-size: 80%;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 3px;
}

.username {
	flex-shrink: 9999999;
	margin: 0 .5em 0 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.info {
	flex-shrink: 0;
	margin-left: auto;
	font-size: 0.9em;
}

.badgeRoles {
	margin: 0 .5em 0 0;
}

.badgeRole {
	height: 1.3em;
	vertical-align: -20%;

	& + .badgeRole {
		margin-left: 0.2em;
	}
}
</style>
