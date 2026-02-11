<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._announcement.shouldNotBeUsedToPresentPermanentInfo }}</MkInfo>
			<MkInfo v-if="announcementsStatus === 'active' && announcements.length > 5" warn>{{ i18n.ts._announcement.tooManyActiveAnnouncementDescription }}</MkInfo>

			<MkSelect v-model="announcementsStatus" :items="announcementsStatusDef">
				<template #label>{{ i18n.ts.filter }}</template>
			</MkSelect>

			<MkLoading v-if="loading"/>

			<template v-else>
				<MkFolder v-for="(announcement, announcementIndex) in announcements" :key="announcement.id ?? announcement._id" :defaultOpen="announcement.id == null">
					<template #label>{{ announcement.title }}</template>
					<template #icon>
						<i v-if="announcement.icon === 'info'" class="ti ti-info-circle"></i>
						<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i>
						<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);"></i>
						<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
					</template>
					<template #caption>{{ announcement.text }}</template>
					<template #footer>
						<div class="_buttons">
							<MkButton rounded primary @click="save(announcement)"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton v-if="announcement.id != null && announcement.isActive" rounded @click="archive(announcement)"><i class="ti ti-check"></i> {{ i18n.ts._announcement.end }} ({{ i18n.ts.archive }})</MkButton>
							<MkButton v-if="announcement.id != null && !announcement.isActive" rounded @click="unarchive(announcement)"><i class="ti ti-restore"></i> {{ i18n.ts.unarchive }}</MkButton>
							<MkButton v-if="announcement.id != null" rounded danger @click="del(announcement)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
						</div>
					</template>

					<div class="_gaps">
						<MkInput v-model="announcement.title">
							<template #label>{{ i18n.ts.title }}</template>
						</MkInput>
						<MkTextarea v-model="announcement.text" mfmAutocomplete :mfmPreview="true">
							<template #label>{{ i18n.ts.text }}</template>
						</MkTextarea>
						<MkInput v-model="announcement.imageUrl" type="url">
							<template #label>{{ i18n.ts.imageUrl }}</template>
						</MkInput>
						<MkRadios
							v-model="announcement.icon"
							:options="[
								{ value: 'info', icon: 'ti ti-info-circle' },
								{ value: 'warning', icon: 'ti ti-alert-triangle', iconStyle: 'color: var(--MI_THEME-warn);' },
								{ value: 'error', icon: 'ti ti-circle-x', iconStyle: 'color: var(--MI_THEME-error);' },
								{ value: 'success', icon: 'ti ti-check', iconStyle: 'color: var(--MI_THEME-success);' },
							]"
						>
							<template #label>{{ i18n.ts.icon }}</template>
						</MkRadios>
						<MkRadios
							v-model="announcement.display"
							:options="[
								{ value: 'normal', label: i18n.ts.normal },
								{ value: 'banner', label: i18n.ts.banner },
								{ value: 'dialog', label: i18n.ts.dialog },
							]"
						>
							<template #label>{{ i18n.ts.display }}</template>
						</MkRadios>
						<div class="_gaps_s">
							<div class="label" :class="$style.rolesLabel">{{ i18n.ts.roles }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></div>
							<div v-for="role in announcement.roles" :key="`announcement-role-${role.id}`" class="_gaps_s">
								<div :class="$style.roleItems">
									<MkRolePreview :role="role" :noLink="true" :forModeration="false" :class="$style.rolePreview"/>
									<button class="_button" :class="$style.remove" @click="removeRole(announcementIndex, role)"><i class="ti ti-x"></i></button>
								</div>
							</div>
							<MkButton @click="addRole(announcement)">{{ i18n.ts.add }}</MkButton>
						</div>
						<MkInfo v-if="announcement.display === 'dialog'" warn>{{ i18n.ts._announcement.dialogAnnouncementUxWarn }}</MkInfo>
						<MkSwitch v-model="announcement.forExistingUsers" :helpText="i18n.ts._announcement.forExistingUsersDescription">
							{{ i18n.ts._announcement.forExistingUsers }}
						</MkSwitch>
						<MkSwitch v-model="announcement.silence" :helpText="i18n.ts._announcement.silenceDescription">
							{{ i18n.ts._announcement.silence }}
						</MkSwitch>
						<MkSwitch v-model="announcement.needConfirmationToRead" :helpText="i18n.ts._announcement.needConfirmationToReadDescription">
							{{ i18n.ts._announcement.needConfirmationToRead }}
						</MkSwitch>
						<p v-if="announcement.reads">{{ i18n.tsx.nUsersRead({ n: announcement.reads }) }}</p>
					</div>
				</MkFolder>
			</template>
			<MkLoading v-if="loadingMore"/>
			<MkButton @click="more()">
				<i class="ti ti-reload"></i>{{ i18n.ts.more }}
			</MkButton>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { genId } from '@/utility/id.js';
import MkRolePreview from '@/components/MkRolePreview.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';

const {
	model: announcementsStatus,
	def: announcementsStatusDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.active, value: 'active' },
		{ label: i18n.ts.archived, value: 'archived' },
	],
	initialValue: 'active',
});

const loading = ref(true);
const loadingMore = ref(false);

const announcements = ref<(Omit<Misskey.entities.AdminAnnouncementsListResponse[number], 'id' | 'createdAt' | 'updatedAt' | 'reads' | 'isActive'> & {
	id: string | null;
	_id?: string;
	isActive?: Misskey.entities.AdminAnnouncementsListResponse[number]['isActive'];
	reads?: Misskey.entities.AdminAnnouncementsListResponse[number]['reads'];
})[]>([]);

watch(announcementsStatus, (to) => {
	loading.value = true;
	misskeyApi('admin/announcements/list', {
		status: to,
	}).then(announcementResponse => {
		announcements.value = announcementResponse;
		loading.value = false;
	});
}, { immediate: true });

misskeyApi('admin/announcements/list').then(announcementResponse => {
	announcements.value = announcementResponse;
});

async function selectRole(initialRoleIds: string[] = []): Promise<{ id: string, name: string }[]> {
	const result = await os.selectRole({
		initialRoleIds,
		title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction,
		infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription,
		publicOnly: true,
	});

	if (result.canceled) {
		return [];
	}

	return result.result.map(it => ({ id: it.id, name: it.name }));
}

async function addRole(announcement) {
	const roles = await selectRole();
	if (roles.length > 0) {
		const index = announcements.value.findIndex(x => x.id === announcement.id);
		announcements.value[index].roles.push(...roles);
	}
}

function removeRole(index: number, role) {
	announcements.value[index].roles = announcements.value[index].roles.filter(x => x.id !== role.id);
}

function add() {
	announcements.value.unshift({
		_id: genId(),
		id: null,
		title: 'New announcement',
		text: '',
		imageUrl: null,
		icon: 'info',
		display: 'normal',
		forExistingUsers: false,
		silence: false,
		needConfirmationToRead: false,
		userId: null,
		isRoleSpecified: false,
		roles: [],
		roleIds: [] as string[],
	});
}

async function del(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: announcement.title }),
	});
	if (canceled) return;
	announcements.value = announcements.value.filter(x => x !== announcement);
	misskeyApi('admin/announcements/delete', {
		id: announcement.id,
	});
}

async function archive(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { _id, ...data } = announcement; // _idを消す
	await os.apiWithDialog('admin/announcements/update', {
		...data,
		id: announcement.id, // TSを黙らすため
		isActive: false,
	});
	refresh();
}

async function unarchive(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { _id, ...data } = announcement; // _idを消す
	await os.apiWithDialog('admin/announcements/update', {
		...data,
		id: announcement.id, // TSを黙らすため
		isActive: true,
	});
	refresh();
}

async function save(announcement: (typeof announcements)['value'][number]) {
	const { _id, ...data } = announcement; // _idを消す
	announcement.roleIds = announcement.roles.map(role => role.id);
	if (announcement.roleIds.length === 0) {
		announcement.isRoleSpecified = false;
	} else {
		announcement.isRoleSpecified = true;
	}
	if (announcement.id == null) {
		await os.apiWithDialog('admin/announcements/create', data);
		refresh();
	} else {
		os.apiWithDialog('admin/announcements/update', {
			...data,
			id: announcement.id, // TSを黙らすため
		});
	}
}

function more() {
	loadingMore.value = true;
	misskeyApi('admin/announcements/list', {
		status: announcementsStatus.value,
		untilId: announcements.value.reduce((acc, announcement) => announcement.id != null ? announcement : acc).id!,
	}).then(announcementResponse => {
		announcements.value = announcements.value.concat(announcementResponse);
		loadingMore.value = false;
	});
}

function refresh() {
	misskeyApi('admin/announcements/list').then(announcementResponse => {
		announcements.value = announcementResponse;
	});
}

refresh();

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.add,
	handler: add,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}));
</script>

<style module>
.roleItems {
	display: flex;
}

.rolePreview {
	flex-grow: 1;
}

.rolesLabel {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;

	&:empty {
		display: none;
	}
}

.remove {
	width: 32px;
	height: 32px;
	align-self: center;
	& > i:before {
		color: #ff2a2a;
	}
}
</style>
