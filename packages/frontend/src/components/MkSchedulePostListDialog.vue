<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:width="600"
	:height="650"
	:withOkButton="false"
	@click="cancel()"
	@close="cancel()"
	@closed="emit('closed')"
	@esc="cancel()"
>
	<template #header>
		{{ i18n.ts.schedulePostList }}
	</template>
	<div class="_spacer">
		<MkPagination ref="paginationEl" :paginator="pagination" withControl>
			<template #empty>
				<div class="_fullinfo">
					<MkResult type="empty" :text="i18n.ts.nothing"/>
				</div>
			</template>

			<template #default="{ items }">
				<div class="_gaps_s">
					<div
						v-for="schedule in (items as unknown as SchedulePost[])"
						:key="schedule.id"
						v-panel
						:class="[$style.schedule]"
					>
						<div :class="$style.scheduleBody" class="_gaps_s">
							<div :class="$style.scheduleInfo">
								<div :class="$style.scheduleMeta">
									<div v-if="schedule.note.cw" class="_nowrap">
										<i class="ti ti-eye-off"></i> {{ schedule.note.cw }}
									</div>
									<div v-if="schedule.note.fileIds.length > 0" class="_nowrap">
										<i class="ti ti-photo"></i> {{ i18n.tsx.withNFiles({ n: schedule.note.fileIds.length }) }}
									</div>
								</div>
							</div>
							<div :class="$style.scheduleContent">
								<Mfm v-if="schedule.note.text" :text="schedule.note.text" :plain="true" :author="schedule.note.user"/>
								<div v-else class="empty">{{ i18n.ts.nothing }}</div>
							</div>
							<div :class="$style.scheduleFooter">
								<div :class="$style.scheduleVisibility">
									<span :title="i18n.ts._visibility[schedule.note.visibility]">
										<i v-if="schedule.note.visibility === 'public'" class="ti ti-world"></i>
										<i v-else-if="schedule.note.visibility === 'home'" class="ti ti-home"></i>
										<i v-else-if="schedule.note.visibility === 'followers'" class="ti ti-lock"></i>
										<i v-else-if="schedule.note.visibility === 'specified'" class="ti ti-mail"></i>
										{{ i18n.ts._visibility[schedule.note.visibility] }}
									</span>
								</div>
								<div :class="$style.scheduledTime">
									<i class="ti ti-clock"></i>
									<MkTime :time="schedule.scheduledAt" mode="detail" colored/>
								</div>
							</div>
						</div>
						<div :class="$style.scheduleActions" class="_buttons">
							<MkButton
								:class="$style.itemButton"
								small
								@click="editSchedule(schedule)"
							>
								<i class="ti ti-edit"></i>
								{{ i18n.ts.edit }}
							</MkButton>
							<MkButton
								v-tooltip="i18n.ts.delete"
								danger
								small
								:iconOnly="true"
								:class="$style.itemButton"
								@click="deleteSchedule(schedule)"
							>
								<i class="ti ti-trash"></i>
							</MkButton>
						</div>
					</div>
				</div>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, shallowRef, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { Paginator } from '@/utility/paginator.js';

type SchedulePost = {
	id: string;
	note: {
		text?: string;
		cw?: string | null;
		fileIds: string[];
		visibility: 'public' | 'public_non_ltl' | 'home' | 'followers' | 'specified';
		visibleUsers: Misskey.entities.UserLite[];
		reactionAcceptance: string | null;
		user: Misskey.entities.User;
		createdAt: string;
		isSchedule: boolean;
	};
	userId: string;
	scheduledAt: string;
};

const emit = defineEmits<{
	(ev: 'edit', schedule: SchedulePost): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const paginationEl = ref();
const pagination = markRaw(new Paginator('notes/schedule/list', {
	limit: 10,
}));

const dialogEl = shallowRef<InstanceType<typeof MkModalWindow>>();

function cancel() {
	emit('cancel');
	dialogEl.value?.close();
}

async function editSchedule(schedule: SchedulePost) {
	try {
		await os.apiWithDialog('notes/schedule/delete', { noteId: schedule.id });

		let files: Misskey.entities.DriveFile[] = [];
		if (schedule.note.fileIds.length > 0) {
			try {
				files = await Promise.all(
					schedule.note.fileIds.map(fileId =>
						misskeyApi('drive/files/show', { fileId })
							.catch(() => null),
					),
				).then(results => results.filter((file): file is Misskey.entities.DriveFile => file !== null));
			} catch (error) {
				console.warn('Failed to fetch some files:', error);
			}
		}

		const initialNote = {
			id: schedule.id,
			text: schedule.note.text ?? null,
			cw: schedule.note.cw ?? null,
			visibility: schedule.note.visibility,
			visibleUserIds: schedule.note.visibleUsers.map(u => u.id),
			localOnly: false,
			reactionAcceptance: schedule.note.reactionAcceptance,
			user: schedule.note.user,
			createdAt: schedule.note.createdAt,
			files: files,
			isSchedule: true,
		} as Misskey.entities.Note & { isSchedule: boolean };

		await new Promise(resolve => window.setTimeout(resolve, 100));

		dialogEl.value?.close();

		await os.post({
			initialNote: initialNote,
			instant: false,
		});
	} catch (error) {
		console.error('Failed to edit schedule:', error);
		os.alert({
			type: 'error',
			text: String(i18n.ts.somethingHappened),
		});
	}
}

async function deleteSchedule(schedule: SchedulePost) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: String(i18n.tsx.deleteAreYouSure({ x: schedule.note.text ?? String(i18n.ts.nothing) })),
	});

	if (canceled) return;

	try {
		await os.apiWithDialog('notes/schedule/delete', { noteId: schedule.id });
		if (paginationEl.value?.reload) {
			paginationEl.value.reload();
		}
	} catch (error) {
		console.error('Failed to delete schedule:', error);
	}
}
</script>

<style lang="scss" module>
.schedule {
	padding: 16px;
	gap: 16px;
	border-radius: 10px;
}

.scheduleBody {
	width: 100%;
	min-width: 0;
}

.scheduleInfo {
	display: flex;
	width: 100%;
	font-size: 0.85em;
	opacity: 0.7;
}

.scheduleMeta {
	flex-grow: 1;
	min-width: 0;
}

.scheduleContent {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	line-clamp: 3;
	overflow: hidden;
	font-size: 0.9em;

	.empty {
		opacity: 0.7;
		font-style: italic;
	}
}

.scheduleFooter {
	display: flex;
	align-items: center;
	gap: 8px;
	justify-content: space-between;
}

.scheduleVisibility {
	flex-shrink: 0;
	opacity: 0.7;

	i {
		margin-right: 4px;
	}
}

.scheduledTime {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 85%;
	opacity: 0.7;
}

.scheduleActions {
	margin-top: 16px;
	padding-top: 16px;
	border-top: solid 1px var(--MI_THEME-divider);
}

.itemButton {
	min-width: 0;
}
</style>
