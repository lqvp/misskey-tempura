<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="contactForm.status === 'resolved'" class="ti ti-check" style="color: var(--MI_THEME-success)"></i>
		<i v-else-if="contactForm.status === 'closed'" class="ti ti-x" style="color: var(--MI_THEME-error)"></i>
		<i v-else-if="contactForm.status === 'in_progress'" class="ti ti-clock" style="color: var(--MI_THEME-accent)"></i>
		<i v-else class="ti ti-mail" style="color: var(--MI_THEME-warn)"></i>
	</template>
	<template #label>{{ contactForm.subject }}</template>
	<template #caption>{{ getCategoryText(contactForm.category) }} | {{ getReplyMethodText(contactForm.replyMethod) }}</template>
	<template #suffix><MkTime :time="contactForm.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<MkSelect v-model="currentStatus" style="margin: 0; flex: 1;">
				<template #label>{{ i18n.ts._contactForm.updateStatus }}</template>
				<option value="pending">{{ i18n.ts._contactForm.pending }}</option>
				<option value="in_progress">{{ i18n.ts._contactForm.inProgress }}</option>
				<option value="resolved">{{ i18n.ts._contactForm.resolved }}</option>
				<option value="closed">{{ i18n.ts._contactForm.closed }}</option>
			</MkSelect>
			<MkButton primary @click="updateStatus"><i class="ti ti-check"></i> {{ i18n.ts.update }}</MkButton>
			<MkButton @click="deleteForm"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			<button class="_button" style="margin-left: auto; width: 34px;" @click="showMenu"><i class="ti ti-dots"></i></button>
		</div>
	</template>

	<div class="_gaps_s">
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts._contactForm.content }}</template>
			<div class="_gaps_s">
				<Mfm :text="contactForm.content" :linkNavigationBehavior="'window'"/>
			</div>
		</MkFolder>

		<MkFolder :withSpacer="false">
			<template #icon><i class="ti ti-user"></i></template>
			<template #label>{{ i18n.ts._contactForm.contactDescription }}</template>
			<div class="_gaps_s">
				<MkKeyValue>
					<template #key>{{ i18n.ts._contactForm.name }}</template>
					<template #value>{{ contactForm.name || i18n.ts.none }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.replyMethod === 'email'">
					<template #key>{{ i18n.ts._contactForm.email }}</template>
					<template #value>{{ contactForm.email }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.replyMethod === 'misskey'">
					<template #key>{{ i18n.ts._contactForm.misskeyUsername }}</template>
					<template #value>@{{ contactForm.misskeyUsername }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.user">
					<template #key>{{ i18n.ts.registeredUser }}</template>
					<template #value><MkAcct :user="contactForm.user"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.ipAddress">
					<template #key>IP Address</template>
					<template #value>{{ contactForm.ipAddress }}</template>
				</MkKeyValue>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-note"></i></template>
			<template #label>{{ i18n.ts._contactForm.adminNote }}</template>
			<template #suffix>{{ adminNote.length > 0 ? '...' : i18n.ts.none }}</template>
			<div class="_gaps_s">
				<MkTextarea v-model="adminNote" manualSave>
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-user-check"></i></template>
			<template #label>{{ i18n.ts._contactForm.assign }}</template>
			<div class="_gaps_s">
				<MkInput v-model="assignedUsername" type="text" :spellcheck="false" :placeholder="'@username'">
					<template #label>{{ i18n.ts._contactForm.assignedUser }}</template>
				</MkInput>
				<MkButton primary @click="assignUser"><i class="ti ti-check"></i> {{ i18n.ts._contactForm.assign }}</MkButton>
			</div>
		</MkFolder>

		<div v-if="contactForm.assignedUser">
			{{ i18n.ts._contactForm.assignedUser }}:
			<MkAcct :user="contactForm.assignedUser"/>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	contactForm: any; // TODO: 適切な型定義
}>();

const emit = defineEmits<{
	(ev: 'updated', contactFormId: string): void;
}>();

const currentStatus = ref(props.contactForm.status);
const adminNote = ref(props.contactForm.adminNote ?? '');
const assignedUsername = ref('');

watch(adminNote, async () => {
	if (adminNote.value !== props.contactForm.adminNote) {
		misskeyApi('admin/contact-form/update', {
			contactFormId: props.contactForm.id,
			adminNote: adminNote.value,
		}).then(() => {
			emit('updated', props.contactForm.id);
		});
	}
});

function updateStatus() {
	misskeyApi('admin/contact-form/update', {
		contactFormId: props.contactForm.id,
		status: currentStatus.value,
	}).then(() => {
		emit('updated', props.contactForm.id);
	});
}

function assignUser() {
	if (!assignedUsername.value) return;

	// @を取り除く
	const username = assignedUsername.value.replace(/^@/, '');

	misskeyApi('admin/contact-form/update', {
		contactFormId: props.contactForm.id,
		assignedUserId: username, // TODO: ユーザーIDの解決が必要
	}).then(() => {
		assignedUsername.value = '';
		emit('updated', props.contactForm.id);
	});
}

function deleteForm() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	}).then(({ canceled }) => {
		if (canceled) return;

		misskeyApi('admin/contact-form/delete', {
			contactFormId: props.contactForm.id,
		}).then(() => {
			emit('updated', props.contactForm.id);
		});
	});
}

function getCategoryText(category: string): string {
	const categoryMap = {
		bug_report: i18n.ts._contactForm.bugReport,
		feature_request: i18n.ts._contactForm.featureRequest,
		account_issue: i18n.ts._contactForm.accountIssue,
		technical_issue: i18n.ts._contactForm.technicalIssue,
		content_issue: i18n.ts._contactForm.contentIssue,
		other: i18n.ts._contactForm.other,
	};
	return categoryMap[category] || category;
}

function getReplyMethodText(replyMethod: string): string {
	return replyMethod === 'email' ? i18n.ts._contactForm.replyByEmail : i18n.ts._contactForm.replyByMisskey;
}

function showMenu(ev: MouseEvent) {
	os.popupMenu([{
		icon: 'ti ti-hash',
		text: 'Copy ID',
		action: () => {
			copyToClipboard(props.contactForm.id);
		},
	}, {
		icon: 'ti ti-json',
		text: 'Copy JSON',
		action: () => {
			copyToClipboard(JSON.stringify(props.contactForm, null, '\t'));
		},
	}], ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
</style>
