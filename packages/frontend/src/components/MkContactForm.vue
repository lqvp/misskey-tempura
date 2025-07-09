<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="contactForm.status === 'resolved'" class="ti ti-check" :class="$style.iconSuccess"></i>
		<i v-else-if="contactForm.status === 'closed'" class="ti ti-x" :class="$style.iconError"></i>
		<i v-else-if="contactForm.status === 'in_progress'" class="ti ti-clock" :class="$style.iconAccent"></i>
		<i v-else class="ti ti-mail" :class="$style.iconWarn"></i>
	</template>
	<template #label>{{ contactForm.subject }}</template>
	<template #caption>{{ getCategoryText(contactForm.category) }} | {{ getReplyMethodText(contactForm.replyMethod) }}</template>
	<template #suffix><MkTime :time="contactForm.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<MkSelect v-model="currentStatus" :class="$style.statusSelect">
				<template #label>{{ i18n.ts._contactForm.updateStatus }}</template>
				<option value="pending">{{ i18n.ts._contactForm.pending }}</option>
				<option value="in_progress">{{ i18n.ts._contactForm.inProgress }}</option>
				<option value="resolved">{{ i18n.ts._contactForm.resolved }}</option>
				<option value="closed">{{ i18n.ts._contactForm.closed }}</option>
			</MkSelect>
			<MkButton primary @click="updateStatus"><i class="ti ti-check"></i> {{ i18n.ts.update }}</MkButton>
			<MkButton @click="deleteForm"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			<button class="_button" :class="$style.menuButton" @click="showMenu"><i class="ti ti-dots"></i></button>
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

		<MkFolder>
			<template #icon><i class="ti ti-user"></i></template>
			<template #label>{{ i18n.ts._contactForm.contactInfo }}</template>
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
					<template #value><Mfm :text="`@${contactForm.misskeyUsername}`" :linkNavigationBehavior="'window'"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.user">
					<template #key>{{ i18n.ts.registeredUser }}</template>
					<template #value><MkAcct :user="contactForm.user"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.ipAddress">
					<template #key>{{ i18n.ts._contactForm.ipAddress }}</template>
					<template #value>{{ contactForm.ipAddress }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.userAgent">
					<template #key>{{ i18n.ts._contactForm.userAgent }}</template>
					<template #value><span :title="contactForm.userAgent">{{ truncateUserAgent(contactForm.userAgent) }}</span></template>
				</MkKeyValue>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-note"></i></template>
			<template #label>{{ i18n.ts._contactForm.adminNote }}</template>
			<template #suffix>{{ getAdminNotePreview() }} <span v-if="adminNoteChanged" :class="$style.changedMark">*</span></template>
			<div class="_gaps_s">
				<MkTextarea v-model="adminNote">
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
				<MkButton v-if="adminNoteChanged" primary @click="saveAdminNote">
					<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
				</MkButton>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-user-check"></i></template>
			<template #label>{{ i18n.ts._contactForm.assign }}</template>
			<div class="_gaps_s">
				<MkInput v-model="assignedUsername" type="text" :spellcheck="false" :placeholder="i18n.ts._contactForm.placeholderAssignedUser">
					<template #label>{{ i18n.ts._contactForm.assignedUser }}</template>
				</MkInput>
				<MkButton primary @click="assignUser"><i class="ti ti-check"></i> {{ i18n.ts._contactForm.assign }}</MkButton>
			</div>
		</MkFolder>

		<div v-if="contactForm.assignedUser || contactForm.assignedNickname" :class="$style.assignedUserDisplay">
			{{ i18n.ts._contactForm.assignedUser }}:
			<span v-if="contactForm.assignedUser" :class="$style.assignedUserMention">
				<Mfm :text="`@${contactForm.assignedUser.username}${contactForm.assignedUser.host ? '@' + contactForm.assignedUser.host : ''}`" :linkNavigationBehavior="'window'"/>
			</span>
			<span v-else-if="contactForm.assignedNickname" :class="$style.assignedNickname">
				{{ contactForm.assignedNickname }}
			</span>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
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
import { useContactFormCategories } from '@/composables/useContactFormCategories.js';

const props = defineProps<{
	contactForm: any; // TODO: 適切な型定義
}>();

const emit = defineEmits<{
	(ev: 'updated', contactFormId: string): void;
}>();

// Dynamic category management
const { getCategoryLabel } = useContactFormCategories();

const currentStatus = ref(props.contactForm.status);
const adminNote = ref(props.contactForm.adminNote ?? '');
const assignedUsername = ref('');

const adminNoteChanged = computed(() => {
	// null/undefined/空文字を全て空文字として正規化して比較
	const normalizeValue = (val: string | null | undefined): string => val ?? '';
	return normalizeValue(adminNote.value) !== normalizeValue(props.contactForm.adminNote);
});

async function saveAdminNote() {
	if (!adminNoteChanged.value) return;

	try {
		await misskeyApi('admin/contact-form/update', {
			contactFormId: props.contactForm.id,
			adminNote: adminNote.value,
		});
		emit('updated', props.contactForm.id);
		os.toast(i18n.ts.saved);
	} catch (error) {
		console.error('Failed to save admin note:', error);
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

function updateStatus() {
	misskeyApi('admin/contact-form/update', {
		contactFormId: props.contactForm.id,
		status: currentStatus.value,
	}).then(() => {
		emit('updated', props.contactForm.id);
	});
}

async function assignUser() {
	if (!assignedUsername.value) return;

	try {
		const input = assignedUsername.value.trim();

		if (input.startsWith('@')) {
			// Misskeyユーザー直接指定
			const cleanInput = input.replace(/^@/, '');

			// ユーザー名とホストを解析
			let username: string;
			let host: string | null;

			if (cleanInput.includes('@')) {
				// リモートユーザー: user@host.example.com
				const parts = cleanInput.split('@');
				username = parts[0];
				host = parts[1];
			} else {
				// ローカルユーザー: username
				username = cleanInput;
				host = null;
			}

			// 直接ユーザーを取得（検索ではなく）
			const user = await misskeyApi('users/show', {
				username: username,
				host: host,
			});

			await misskeyApi('admin/contact-form/update', {
				contactFormId: props.contactForm.id,
				assignedUserId: user.id,
				assignedNickname: null, // ユーザー割り当て時はニックネームをクリア
			});
		} else {
			// ニックネーム割り当て
			await misskeyApi('admin/contact-form/update', {
				contactFormId: props.contactForm.id,
				assignedUserId: null, // ニックネーム割り当て時はユーザーをクリア
				assignedNickname: input,
			});
		}

		assignedUsername.value = '';
		emit('updated', props.contactForm.id);
	} catch (error) {
		console.error('Failed to assign user:', error);

		// より具体的なエラーメッセージ
		if (error && typeof error === 'object' && 'code' in error) {
			if (error.code === 'NO_SUCH_USER') {
				os.alert({
					type: 'error',
					text: i18n.ts.noSuchUser,
				});
				return;
			}
		}

		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
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
	return getCategoryLabel(category);
}

function getReplyMethodText(replyMethod: string): string {
	return replyMethod === 'email' ? i18n.ts._contactForm.replyByEmail : i18n.ts._contactForm.replyByMisskey;
}

function getAdminNotePreview(): string {
	if (!adminNote.value || adminNote.value.trim() === '') {
		return i18n.ts.none;
	}

	// 最初の行のみを取得（改行で分割）
	const firstLine = adminNote.value.split('\n')[0].trim();

	// 30文字以内の場合はそのまま表示
	if (firstLine.length <= 30) {
		return firstLine;
	}

	// 30文字を超える場合は省略
	return firstLine.substring(0, 27) + '...';
}

function truncateUserAgent(userAgent: string): string {
	if (userAgent.length <= 80) return userAgent;
	return userAgent.substring(0, 77) + '...';
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
// Status icons
.iconSuccess {
	color: var(--MI_THEME-success);
}

.iconError {
	color: var(--MI_THEME-error);
}

.iconAccent {
	color: var(--MI_THEME-accent);
}

.iconWarn {
	color: var(--MI_THEME-warn);
}

// Form controls
.statusSelect {
	margin: 0;
	flex: 1;
}

.menuButton {
	margin-left: auto;
	width: 34px;
}

// UI indicators
.changedMark {
	color: var(--MI_THEME-warn);
	font-weight: bold;
}

// Assigned user display
.assignedUserDisplay {
	margin-top: 8px;
}

.assignedUserMention {
	margin-left: 8px;
	opacity: 0.8;
}

.assignedNickname {
	margin-left: 8px;
	font-weight: 500;
}
</style>
