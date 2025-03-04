<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div v-if="user.host" :class="$style.remoteActions">
		<MkButton :disabled="fetchingRemote" @click="fetchFromRemote">
			<i class="ti ti-refresh"></i> {{ i18n.ts.fetchFromRemote }}
			<MkLoading v-if="fetchingRemote" mini em :colored="false"/>
		</MkButton>
	</div>
	<MkInfo v-if="remoteUsers.length > 0">{{ i18n.ts.showingDataFromRemoteServer }}</MkInfo>
	<div v-if="remoteUsers.length > 0" :class="$style.users">
		<MkUserInfo v-for="user in remoteUsers" :key="user.id" :user="user"/>
	</div>
	<MkPagination v-else v-slot="{items}" ref="list" :pagination="type === 'following' ? followingPagination : followersPagination">
		<div :class="$style.users">
			<MkUserInfo v-for="user in items.map(x => type === 'following' ? x.followee : x.follower)" :key="user.id" :user="user"/>
		</div>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkUserInfo from '@/components/MkUserInfo.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.User;
	type: 'following' | 'followers';
}>();

const fetchingRemote = ref(false);
const remoteUsers = ref<Misskey.entities.User[]>([]);

const followingPagination = {
	endpoint: 'users/following' as const,
	limit: 20,
	params: computed(() => ({
		userId: props.user.id,
	})),
};

const followersPagination = {
	endpoint: 'users/followers' as const,
	limit: 20,
	params: computed(() => ({
		userId: props.user.id,
	})),
};

async function fetchFromRemote() {
	if (!props.user.host) return;

	fetchingRemote.value = true;
	remoteUsers.value = [];
	const protocol = location.protocol === 'https:' ? 'https:' : 'http:';

	try {
		// 1. まずリモートサーバーでのユーザーIDを取得
		const showUrl = `${protocol}//${props.user.host}/api/users/show`;
		const showResponse = await fetch(showUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username: props.user.username,
				host: null, // リモートサーバーから自サーバー上のユーザーを探すので、hostはnull
			}),
		});

		if (!showResponse.ok) {
			throw new Error(`${showResponse.status}: ${showResponse.statusText}`);
		}

		const userInfo = await showResponse.json();

		if (!userInfo || !userInfo.id) {
			throw new Error('User not found on remote server');
		}

		// 2. 取得したIDを使ってフォロー/フォロワーリストを取得
		const endpoint = props.type === 'following' ? 'users/following' : 'users/followers';
		const listUrl = `${protocol}//${props.user.host}/api/${endpoint}`;

		const listResponse = await fetch(listUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				userId: userInfo.id, // リモートサーバーから取得したID
				limit: 100,
			}),
		});

		if (!listResponse.ok) {
			throw new Error(`${listResponse.status}: ${listResponse.statusText}`);
		}

		const data = await listResponse.json();

		if (Array.isArray(data)) {
			remoteUsers.value = data.map(x => props.type === 'following' ? x.followee : x.follower);
			os.toast(i18n.ts.fetchedFromRemoteServer);
		} else {
			throw new Error('Invalid response format');
		}
	} catch (error) {
		console.error(error);
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: i18n.ts.failedToFetchFromRemote + '\n' + (error instanceof Error ? error.message : String(error)),
		});
		remoteUsers.value = [];
	} finally {
		fetchingRemote.value = false;
	}
}
</script>

<style lang="scss" module>
.users {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    grid-gap: var(--MI-margin);
}

.remoteActions {
    display: flex;
    margin-bottom: var(--MI-margin);
    justify-content: flex-end;
}
</style>
