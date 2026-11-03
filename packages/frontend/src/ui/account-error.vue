<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.card">
		<h1 :class="$style.title">{{ i18n.ts._accountError.title }}</h1>
		<p>{{ reasonText }}</p>
		<p v-if="bootAccount.error !== 'unsafe-storage'">{{ i18n.ts._accountError.description }}</p>
		<div v-if="bootAccount.error !== 'unsafe-storage' && accounts.length > 0" :class="$style.list">
			<a v-for="a in accounts" :key="a.id" :href="linkFor(a.id)" :class="$style.item">
				@{{ a.username }}<span :class="$style.host">@{{ a.host }}</span>
			</a>
		</div>
		<p v-else-if="bootAccount.error !== 'unsafe-storage'">{{ i18n.ts._accountError.noAccounts }}</p>
		<button v-if="bootAccount.error !== 'unsafe-storage'" class="_button" :class="$style.item" @click="signin">{{ i18n.ts.login }}</button>
	</div>
</div>
<component :is="popup.component" v-for="popup in popups" :key="popup.id" v-bind="popup.props" v-on="popup.events"/>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { bootAccount } from '@/i.js';
import { i18n } from '@/i18n.js';
import { getAccounts } from '@/accounts.js';
import { popup, popups } from '@/os.js';
import { withAccount } from '@/utility/pinned-account.js';

const accounts = ref<{ id: string; username: string; host: string }[]>([]);

const reasonText = computed(() => {
	switch (bootAccount.error) {
		case 'storage-failed': return i18n.ts._accountError.preferenceSaveFailed;
		case 'unsafe-storage': return i18n.ts._accountError.unsafeStorage;
		case 'invalid-param': return i18n.ts._accountError.invalidParam;
		case 'unknown-account': return i18n.ts._accountError.unknownAccount;
		case 'no-account-info': return i18n.ts._accountError.noAccountInfo;
		default: return '';
	}
});

function signin() {
	const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkSigninDialog.vue')), { autoSet: true }, { closed: () => dispose() });
}

function linkFor(id: string) {
	return withAccount('/', id);
}

onMounted(async () => {
	accounts.value = (await getAccounts()).filter(a => a.token != null && a.user != null).map(a => ({ id: a.id, username: a.username, host: a.host }));
});
</script>

<style lang="scss" module>
.root { min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--MI_THEME-bg); color: var(--MI_THEME-fg); }
.card { max-width: 480px; width: 100%; display: flex; flex-direction: column; gap: 12px; }
.title { font-size: 1.2em; margin: 0; }
.list { display: flex; flex-direction: column; gap: 8px; }
.item { display: block; padding: 10px 14px; border-radius: 8px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); text-decoration: none; }
.host { opacity: 0.6; }
</style>
