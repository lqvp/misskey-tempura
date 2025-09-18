<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="400"
	@close="dialog?.close()"
	@closed="$emit('closed')"
>
	<template v-if="!props.role" #header>
		<div :class="$style.header">
			<span>{{ i18n.ts.communityRole }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></span>
			<XTabs :class="$style.tabs" :rootEl="dialog?.$el" :tab="tab" :tabs="headerTabs" @update:tab="key => tab = key"/>
		</div>
	</template>
	<template v-else #header>{{ i18n.ts.changes }}</template>

	<div v-if="tab === 'add'">
		<div class="_spacer" style="--MI_SPACER-marginMin: 20px; --MI_SPACER-marginMax: 28px;">
			<div class="_gaps_m">
				<div v-if="imgUrl != null" :class="$style.imgs">
					<div :class="$style.imgContainer">
						<img :src="imgUrl" :class="$style.img"/>
					</div>
				</div>
				<MkButton rounded style="margin: 0 auto;" @click="changeImage">{{ i18n.ts.selectFile }}</MkButton>
				<MkInput v-model="name">
					<template #label>{{ i18n.ts.name }}</template>
				</MkInput>
				<MkTextarea v-model="description">
					<template #label>{{ i18n.ts.description }}</template>
				</MkTextarea>
				<MkColorInput v-model="color">
					<template #label>{{ i18n.ts.color }}</template>
				</MkColorInput>
				<MkSwitch v-model="isPublic">{{ i18n.ts._role.isPublic }}</MkSwitch>
			</div>
		</div>
		<div :class="$style.footer">
			<MkButton primary rounded style="margin: 0 auto;" @click="done"><i class="ti ti-check"></i> {{ props.role ? i18n.ts.update : i18n.ts.create }}</MkButton>
		</div>
	</div>

	<div v-else-if="tab === 'manage'">
		<div class="_spacer" style="--MI_SPACER-marginMin: 20px; --MI_SPACER-marginMax: 28px;">
			<div class="_gaps_m">
				<div class="_gaps_s">
					<MkFoldableSection>
						<template #header>{{ i18n.ts.assignedRole }}</template>
						<div class="_gaps_s">
							<DialogRole v-for="role in rolesAssigned" :key="role.id" :role="role" :isAssigned="true"/>
						</div>
					</MkFoldableSection>
					<MkFoldableSection>
						<template #header>{{ i18n.ts.assignableRole }}</template>
						<div class="_gaps_s">
							<DialogRole v-for="role in roles" :key="role.id" :role="role" :isAssigned="false"/>
						</div>
					</MkFoldableSection>
				</div>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onMounted, computed, ref } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import * as os from '@/os';
import { i18n } from '@/i18n';
import MkSwitch from '@/components/MkSwitch.vue';
import { selectFile } from '@/utility/drive.js';
import XTabs from '@/components/global/MkPageHeader.tabs.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkColorInput from '@/components/MkColorInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import DialogRole from '@/pages/DialogRole.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

const props = defineProps<{
	role?: any,
}>();

let dialog = ref<InstanceType<typeof MkModalWindow> | undefined>(undefined);
let name = ref<string>('');
let description = ref<string>('');
let color = ref<string>('#000000');
let isPublic = ref(false);
let imgUrl = ref<string | null>(null);

interface Role {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	description: string;
	isModerator: boolean;
	isAdministrator: boolean;
	displayOrder: number;
	isRainbow: boolean;
}

let assignedList: Role[] = [];
let roleList: Role[] = [];

let rolesAssigned = computed(() => assignedList);
let roles = computed(() => roleList);

onMounted(() => {
	if (props.role) {
		name.value = props.role.name;
		description.value = props.role.description;
		color.value = props.role.color;
		isPublic.value = props.role.isPublic;
		imgUrl.value = props.role.iconUrl;
	}
});

onMounted(async () => {
	assignedList = await misskeyApi('roles/list', {
		assignedOnly: true,
	});
	roleList = await misskeyApi('roles/list', {
		communityPublicOnly: true,
	}).then(v => v.filter(r => !assignedList.some(ra => r.id === ra.id)));
});

const tab = ref(($i?.policies.canAddRoles || $i?.policies.canCreateRole) ? 'add' : 'manage');
const headerTabs = computed(() => {
	const tabs: { key: string; title: string; }[] = [];
	if ($i?.policies.canAddRoles || $i?.policies.canCreateRole) {
		tabs.push({
			key: 'add',
			title: i18n.ts.add,
		});
	}
	tabs.push({
		key: 'manage',
		title: i18n.ts.manage,
	});
	return tabs;
});

const emit = defineEmits<{
	(ev: 'done', v: { deleted?: boolean; updated?: any; created?: any }): void,
	(ev: 'closed'): void
}>();

async function changeImage(ev) {
	const file = await selectFile(ev.currentTarget ?? ev.target, null);
	if (file != null) {
		imgUrl.value = file.url;
	}
}

async function done() {
	if (!$i?.policies.canCreateRole) return;

	const params = {
		name: name.value,
		description: description.value,
		iconUrl: imgUrl.value,
		color: color.value,
		isPublic: isPublic.value,
	};

	if (props.role) {
		await os.apiWithDialog('roles/update', {
			roleId: props.role.id,
			...params,
		});

		emit('done', {
			updated: {
				roleId: props.role.id,
				...params,
			},
		});
	} else {
		const created = await os.apiWithDialog('roles/add', params);

		emit('done', {
			created: created,
		});
	}
	dialog.value?.close();
}
</script>

	<style lang="scss" module>

	.header {
		display: flex;
		gap: 10px;
	}

	.imgs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.imgContainer {
		padding: 8px;
		border-radius: 6px;
	}

	.img {
		display: block;
		height: 64px;
		width: 64px;
		object-fit: contain;
	}

	.roleItem {
		display: flex;
	}

	.role {
		flex: 1;
	}

	.roleUnassign {
		width: 32px;
		height: 32px;
		margin-left: 8px;
		align-self: center;
	}

	.footer {
		position: sticky;
		bottom: 0;
		left: 0;
		padding: 12px;
		border-top: solid 0.5px var(--divider);
		-webkit-backdrop-filter: var(--blur, blur(15px));
		backdrop-filter: var(--blur, blur(15px));
	}

	// profile.vueからの流用
	.metadataRoot {
		container-type: inline-size;
	}

	.metadataMargin {
		margin-bottom: 1.5em;
	}

	.aliaseDragItem {
		display: flex;
		padding-bottom: .75em;
		align-items: flex-end;
		border-bottom: solid 0.5px var(--divider);

		&:last-child {
			border-bottom: 0;
		}

		/* (drag button) 32px + (drag button margin) 8px + (input width) 200px * 2 + (input gap) 12px = 452px */
		@container (max-width: 452px) {
			align-items: center;
		}
	}

	.dragItemHandle {
		cursor: grab;
		width: 32px;
		height: 32px;
		margin: 0 8px 0 0;
		opacity: 0.5;
		flex-shrink: 0;

		&:active {
			cursor: grabbing;
		}
	}

	.dragItemRemove {
		@extend .dragItemHandle;

		color: #ff2a2a;
		opacity: 1;
		cursor: pointer;

		&:hover, &:focus {
			opacity: .7;
		}
		&:active {
			cursor: pointer;
		}
	}

	.dragItemForm {
		flex-grow: 1;
	}

	.tabs:first-child {
		margin-left: auto;
		padding: 0 12px;
	}
	.tabs {
		pointer-events: auto;
		margin-right: auto;
	}
	</style>
