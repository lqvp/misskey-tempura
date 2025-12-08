<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="normalizedNote == null" :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
<div v-else-if="normalizedNote && !muted" :class="[$style.root, { [$style.children]: depth > 1 }]">
	<div :class="$style.main">
		<div v-if="normalizedNote.channel" :class="$style.colorBar" :style="{ background: normalizedNote.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="normalizedNote.user" link preview/>
		<div :class="$style.body">
			<MkNoteHeader :class="$style.header" :note="normalizedNote" :mini="true"/>
			<div>
				<p v-if="normalizedNote.cw != null" :class="$style.cw">
					<Mfm v-if="normalizedNote.cw != ''" style="margin-right: 8px;" :text="normalizedNote.cw" :author="normalizedNote.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="normalizedNote.text" :files="normalizedNote.files" :poll="normalizedNote.poll"/>
				</p>
				<div v-show="normalizedNote.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="normalizedNote"/>
				</div>
			</div>
		</div>
	</div>
	<template v-if="depth < 5">
		<MkNoteSub v-for="reply in replies" :key="reply.id" :note="reply" :class="$style.reply" :detail="true" :depth="depth + 1"/>
	</template>
	<div v-else :class="$style.more">
		<MkA class="_link" :to="notePage(normalizedNote)">{{ i18n.ts.continueThread }} <i class="ti ti-chevron-double-right"></i></MkA>
	</div>
</div>
<div v-else :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="normalizedNote.userId" :to="userPage(normalizedNote.user)">
				<MkUserName :user="normalizedNote.user"/>
			</MkA>
		</template>
	</I18n>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { notePage } from '@/filters/note.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import type { NormalizedNote } from '@/utility/normalize-note.js';
import { normalizeNote } from '@/utility/normalize-note.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note | null;
	detail?: boolean;

	// how many notes are in between this one and the note being viewed in detail
	depth?: number;
}>(), {
	depth: 1,
});

const normalizedNote = computed<NormalizedNote | null>(() => props.note ? normalizeNote(props.note) : null);
const muted = ref(normalizedNote.value && $i ? checkWordMute(normalizedNote.value, $i, $i.mutedWords) : false);

const showContent = ref(false);
const replies = ref<NormalizedNote[]>([]);

if (props.detail && normalizedNote.value) {
	misskeyApi('notes/children', {
		noteId: normalizedNote.value.id,
		limit: 5,
	}).then(res => {
		replies.value = res.map(n => normalizeNote(n as Misskey.entities.Note));
	});
}
</script>

<style lang="scss" module>
.root {
	padding: 16px 32px;
	font-size: 0.9em;
	position: relative;

	&.children {
		padding: 10px 0 0 16px;
		font-size: 1em;
	}
}

.main {
	display: flex;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 8px);
	border-radius: 999px;
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 8px 0 0;
	width: 38px;
	height: 38px;
	border-radius: 8px;
}

.body {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 2px;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	margin: 0;
	padding: 0;
}

.reply, .more {
	border-left: solid 0.5px var(--MI_THEME-divider);
	margin-top: 10px;
}

.more {
	padding: 10px 0 0 16px;
}

@container (max-width: 450px) {
	.root {
		padding: 14px 16px;

		&.children {
			padding: 10px 0 0 8px;
		}
	}
}

.muted {
	text-align: center;
	padding: 8px !important;
	border: 1px solid var(--MI_THEME-divider);
	margin: 8px 8px 0 8px;
	border-radius: 8px;
}

.deleted {
	text-align: center;
	padding: 8px !important;
	margin: 8px 8px 0 8px;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
