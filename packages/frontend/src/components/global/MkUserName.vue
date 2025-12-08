<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Mfm :text="(prefer.s.anonymizeMutedUsers && user.isMuted) ? i18n.ts.mutedUsers : userName(user)" :author="user" :plain="true" :nowrap="nowrap" :emojiUrls="user.emojis"/>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { userName } from '@/filters/user';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

type UserLike = Pick<Misskey.entities.UserDetailed, 'id' | 'username' | 'host' | 'name' | 'avatarUrl' | 'avatarBlurhash' | 'emojis' | 'isMuted' | 'approved'> &
	Partial<Omit<Misskey.entities.UserDetailed, 'id' | 'username' | 'host' | 'name' | 'avatarUrl' | 'avatarBlurhash' | 'emojis' | 'isMuted' | 'approved'>> & {
		avatarDecorations?: Misskey.entities.UserDetailed['avatarDecorations'];
		approved?: boolean;
	};

const props = withDefaults(defineProps<{
	user: UserLike;
	nowrap?: boolean;
}>(), {
	nowrap: true,
});

const user = computed(() => ({
	...props.user,
	avatarDecorations: props.user.avatarDecorations ?? [],
	onlineStatus: props.user.onlineStatus ?? 'unknown',
}));
</script>
