<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/accounts" :label="i18n.ts.accounts" :keywords="['accounts']" icon="ti ti-users">
	<div class="_gaps">
		<div class="_buttons">
			<MkButton primary @click="addAccount"><i class="ti ti-plus"></i> {{ i18n.ts.addAccount }}</MkButton>
			<!--<MkButton @click="refreshAllAccounts"><i class="ti ti-refresh"></i></MkButton>-->
		</div>

		<template v-for="x in accounts" :key="x.host + x.id">
			<MkUserCardMini v-if="x.user" :user="x.user" :class="$style.user" @click.prevent="showMenu(x.host, x.id, $event)"/>
		</template>

		<MkFolder v-if="$i != null && !$i.isSubAccount" :defaultOpen="true">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label>{{ i18n.ts.subAccounts }}</template>

			<div class="_gaps_s">
				<MkButton primary @click="createSub"><i class="ti ti-plus"></i> {{ i18n.ts.createSubAccount }}</MkButton>

				<div v-for="s in subs" :key="s.user.id" class="_panel" :class="$style.sub">
					<MkUserCardMini :user="s.user" :class="$style.user" @click.prevent="showSubMenu(s, $event)"/>
					<div :class="$style.subBody" class="_gaps_s">
						<div v-if="!s.approved" :class="$style.badge">{{ i18n.ts.subAccountPending }}</div>
						<div v-else-if="s.isSuspended" :class="$style.badge">{{ i18n.ts.subAccountSuspended }}</div>
						<MkSwitch :modelValue="s.showParentOnProfile" @update:modelValue="v => updateDisplay(s, { showParentOnProfile: v })">{{ i18n.ts.showParentOnProfile }}</MkSwitch>
						<MkSwitch :modelValue="s.showSubOnProfile" @update:modelValue="v => updateDisplay(s, { showSubOnProfile: v })">{{ i18n.ts.showSubOnProfile }}</MkSwitch>
					</div>
				</div>
			</div>
		</MkFolder>

		<MkFolder v-else-if="$i != null && $i.isSubAccount" :defaultOpen="true">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label>{{ i18n.ts.parentAccount }}</template>

			<div class="_gaps_s">
				<MkSwitch :modelValue="$i.showParentOnProfile" @update:modelValue="v => updateOwnDisplay({ showParentOnProfile: v })">{{ i18n.ts.showParentOnProfile }}</MkSwitch>
				<MkSwitch :modelValue="$i.showSubOnProfile" @update:modelValue="v => updateOwnDisplay({ showSubOnProfile: v })">{{ i18n.ts.showSubOnProfile }}</MkSwitch>
			</div>
		</MkFolder>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import { host } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { switchAccount, removeAccount, login, updateCurrentAccount, getAccountWithSigninDialog, getAccountWithSignupDialog, getAccounts } from '@/accounts.js';
import { createSubAccountFlow } from '@/utility/sub-account-flow.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { prefer } from '@/preferences.js';

const accounts = await getAccounts();

type SubItem = Misskey.entities.ISubAccountsListResponse[number];
const subs = ref<SubItem[]>([]);

async function loadSubs() {
	if ($i == null || $i.isSubAccount) return;
	subs.value = await misskeyApi('i/sub-accounts/list').catch(() => []);
}

await loadSubs();

async function createSub() {
	if (await createSubAccountFlow()) await loadSubs();
}

async function updateDisplay(s: SubItem, flags: { showParentOnProfile?: boolean; showSubOnProfile?: boolean }) {
	await misskeyApi('i/sub-accounts/update-display', { subId: s.user.id, ...flags });
	Object.assign(s, flags);
}

async function updateOwnDisplay(flags: { showParentOnProfile?: boolean; showSubOnProfile?: boolean }) {
	await misskeyApi('i/sub-accounts/update-display', flags);
	updateCurrentAccount(flags);
}

async function switchToSub(s: SubItem) {
	// the token is only issued by the main account, once per device; afterwards it is a normal entry of the account list
	const key = host + '/' + s.user.id;
	let token: string | undefined = store.s.accountTokens[key];
	if (token != null) {
		// the token may have been regenerated on another device: check it, and ask the main account again once if it no longer works
		const valid = await misskeyApi('i', {}, token).then(() => true, () => false);
		if (!valid) {
			token = undefined;
			await removeAccount(host, s.user.id);
		}
	}
	if (token == null) {
		token = (await misskeyApi('i/sub-accounts/switch', { subId: s.user.id })).token;
		store.set('accountTokens', { ...store.s.accountTokens, [key]: token });
	}
	login(token);
}

function showSubMenu(s: SubItem, ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.switch,
		icon: 'ti ti-switch-horizontal',
		action: () => switchToSub(s),
	}, {
		text: i18n.ts.subAccountRegenerateToken,
		icon: 'ti ti-refresh',
		action: async () => {
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.subAccountRegenerateTokenConfirm });
			if (canceled) return;
			await misskeyApi('i/sub-accounts/regenerate-token', { subId: s.user.id });
			removeAccount(host, s.user.id);
			os.success();
		},
	}, {
		text: i18n.ts.delete,
		icon: 'ti ti-trash',
		danger: true,
		action: async () => {
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.subAccountDeleteConfirm });
			if (canceled) return;
			await misskeyApi('i/sub-accounts/delete', { subId: s.user.id });
			removeAccount(host, s.user.id);
			await loadSubs();
		},
	}], ev.currentTarget ?? ev.target);
}

function refreshAllAccounts() {
	// TODO
}

function showMenu(host: string, id: string, ev: PointerEvent) {
	let menu: MenuItem[];

	menu = [{
		text: i18n.ts.switch,
		icon: 'ti ti-switch-horizontal',
		action: () => switchAccount(host, id),
	}, {
		text: i18n.ts.remove,
		icon: 'ti ti-trash',
		action: () => removeAccount(host, id),
	}];

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

function addAccount(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.existingAccount,
		action: () => { addExistingAccount(); },
	}, {
		text: i18n.ts.createAccount,
		action: () => { createAccount(); },
	}], ev.currentTarget ?? ev.target);
}

function addExistingAccount() {
	getAccountWithSigninDialog().then((res) => {
		if (res != null) {
			os.success();
		}
	});
}

function createAccount() {
	getAccountWithSignupDialog().then((res) => {
		if (res != null) {
			login(res.token);
		}
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.accounts,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.sub {
	padding: 12px;
}

.subBody {
	margin-top: 12px;
}

.badge {
	display: inline-block;
	padding: 2px 8px;
	font-size: 85%;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.user {
	cursor: pointer;
}

.unknownUser {
	display: flex;
	align-items: center;
	text-align: start;
	padding: 16px;
	background: var(--MI_THEME-panel);
	border-radius: 8px;
	font-size: 0.9em;
}

.unknownUserAvatarMock {
	display: block;
	width: 34px;
	height: 34px;
	line-height: 34px;
	text-align: center;
	font-size: 16px;
	margin-right: 12px;
	background-color: color-mix(in srgb, var(--MI_THEME-fg), transparent 85%);
	color: color-mix(in srgb, var(--MI_THEME-fg), transparent 25%);
	border-radius: 50%;
}

.unknownUserTitle {
	display: block;
	width: 100%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 18px;
}

.unknownUserSub {
	display: block;
	width: 100%;
	font-size: 95%;
	opacity: 0.7;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 16px;
}
</style>
