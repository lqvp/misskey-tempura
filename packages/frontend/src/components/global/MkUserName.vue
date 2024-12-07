<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Mfm :text="(defaultStore.state.anonymizeMutedUsers && user.isMuted) ? i18n.ts.mutedUsers : userName(user)" :author="user" :plain="true" :nowrap="nowrap" :emojiUrls="user.emojis"/>
</template>

<script lang="ts" setup>
import { } from 'vue';
import * as Misskey from 'misskey-js';
import { userName } from '@/filters/user';
import { i18n } from '@/i18n.js';
import { defaultStore } from '@/store.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed;
	nowrap?: boolean;
}>(), {
	nowrap: true,
});
</script>
