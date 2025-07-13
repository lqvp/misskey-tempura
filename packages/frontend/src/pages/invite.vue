<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div v-if="!showInvite || !($i && ($i.isAdmin || $i.policies.canInvite))" class="_spacer" style="--MI_SPACER-w: 1200px;">
		<MkResult type="empty"/>
	</div>
	<div v-else class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps_m" style="text-align: center;">
			<div v-if="resetCycle && inviteLimit">{{ i18n.tsx.inviteLimitResetCycle({ time: resetCycle, limit: inviteLimit }) }}</div>
			<MkButton inline primary rounded :disabled="currentInviteLimit !== null && currentInviteLimit <= 0" @click="create"><i class="ti ti-user-plus"></i> {{ i18n.ts.createInviteCode }}</MkButton>
			<MkFolder v-if="$i?.policies.canSkipInviteEmailAuth || $i?.policies.canSkipInviteApproval">
				<template #label>{{ i18n.ts.options }}</template>
				<div class="_gaps_s">
					<MkSwitch v-if="$i?.policies.canSkipInviteEmailAuth" v-model="skipEmailAuth">{{ i18n.ts.skipEmailAuth }}</MkSwitch>
					<MkSwitch v-if="$i?.policies.canSkipInviteApproval" v-model="skipApproval">{{ i18n.ts.skipApproval }}</MkSwitch>
					<MkInput v-model="description" type="text" :maxlength="256">
						<template #label>{{ i18n.ts.description }}<span class="_beta">{{ i18n.ts.optional }}</span></template>
					</MkInput>
				</div>
			</MkFolder>
			<div v-if="currentInviteLimit !== null">{{ i18n.tsx.createLimitRemaining({ limit: currentInviteLimit }) }}</div>

			<MkPagination :paginator="paginator">
				<template #default="{ items }">
					<div class="_gaps_s">
						<MkInviteCode v-for="item in items" :key="item.id" :invite="item" :onDeleted="deleted"/>
					</div>
				</template>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkInviteCode from '@/components/MkInviteCode.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';
import { $i } from '@/i.js';
import { Paginator } from '@/utility/paginator.js';
import { copyInviteCode, copyInviteUrl } from '@/utility/invite.js';

const currentInviteLimit = ref<null | number>(null);
const inviteLimit = (($i != null && $i.policies.inviteLimit) || (($i == null && instance.policies.inviteLimit))) as number;
const inviteLimitCycle = (($i != null && $i.policies.inviteLimitCycle) || ($i == null && instance.policies.inviteLimitCycle)) as number;
const showInvite = computed(() =>
	instance.disableRegistration ||
	instance.enableSignupRateLimit ||
	instance.approvalRequiredForSignup ||
	instance.emailRequiredForSignup,
);

const paginator = markRaw(new Paginator('invite/list', {
	limit: 10,
}));

const skipEmailAuth = ref(false);
const skipApproval = ref(false);
const description = ref('');

const resetCycle = computed<null | string>(() => {
	if (!inviteLimitCycle) return null;

	const minutes = inviteLimitCycle;
	if (minutes < 60) return minutes + i18n.ts._time.minute;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours + i18n.ts._time.hour;
	return Math.floor(hours / 24) + i18n.ts._time.day;
});

async function create() {
	const ticket = await misskeyApi('invite/create', {
		skipEmailAuth: skipEmailAuth.value,
		skipApproval: skipApproval.value,
		description: description.value,
	});
	const { result } = await os.actions({
		type: 'success',
		title: i18n.ts.inviteCodeCreated,
		text: ticket.code,
		actions: [{
			value: 'copyUrl',
			text: i18n.ts.copyInviteUrl,
			primary: true,
		}, {
			value: 'copyCode',
			text: i18n.ts.copyInviteCode,
			primary: true,
		}, {
			value: 'close',
			text: i18n.ts.close,
		}],
	});

	switch (result) {
		case 'copyUrl':
			copyInviteUrl(ticket.code);
			break;
		case 'copyCode':
			copyInviteCode(ticket.code);
			break;
	}
	paginator.prepend(ticket);
	update();
}

function deleted(id: string) {
	paginator.removeItem(id);
	update();
}

async function update() {
	currentInviteLimit.value = (await misskeyApi('invite/limit')).remaining;
}

update();

definePage(() => ({
	title: i18n.ts.invite,
	icon: 'ti ti-user-plus',
}));
</script>
