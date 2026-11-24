<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker v-slot="slotProps" markerId="tempuraAdminRegistration" :keywords="['registration', 'signup', 'join', 'account', 'invite', 'passphrase', 'email', 'domain', 'follow']">
	<MkFolder :defaultOpen="slotProps.isParentOfTarget">
		<template #icon><SearchIcon><i class="ti ti-user-plus"></i></SearchIcon></template>
		<template #label><SearchLabel>{{ i18n.ts._tempuraAdmin.groupRegistration }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :label="i18n.ts.approvalRequiredForSignup" :keywords="['approval', 'signup', 'registration']">
				<ApprovalRequired :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.defaultRequireSigninToViewContents" :keywords="['signin', 'default', 'visibility', 'contents', 'signup']">
				<DefaultRequireSigninToViewContents :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.validateMinimumUsernameLength" :keywords="['username', 'length', 'min', 'signup']">
				<UsernameMinLength :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts.secondsPerSignup" :keywords="['signup', 'interval', 'rate', 'seconds']">
				<SecondsPerSignup :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="`${i18n.ts.fixedInviteCode}・${i18n.ts.signupPassphrase}`" icon="ti ti-key" :keywords="['invite', 'code', 'passphrase', 'signup']">
				<SignupCodesSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker label="Email Domain Settings" icon="ti ti-mail" :keywords="['email', 'domain', 'whitelist', 'blacklist', 'signup']">
				<EmailDomainSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker :label="i18n.ts._extraSettings.defaultFollowedUsers" icon="ti ti-user-star" :keywords="['default', 'follow', 'forcibly', 'users', 'signup']">
				<DefaultFollowedUsers :meta="meta"/>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import ApprovalRequired from '../sections/ApprovalRequired.vue';
import DefaultRequireSigninToViewContents from '../sections/DefaultRequireSigninToViewContents.vue';
import UsernameMinLength from '../sections/UsernameMinLength.vue';
import SecondsPerSignup from '../sections/SecondsPerSignup.vue';
import SignupCodesSettings from '../sections/SignupCodesSettings.vue';
import EmailDomainSettings from '../sections/EmailDomainSettings.vue';
import DefaultFollowedUsers from '../sections/DefaultFollowedUsers.vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';

defineProps<{
	meta: Misskey.Endpoints['admin/meta']['res'];
}>();
</script>
