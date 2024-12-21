<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:withOkButton="true"
	:okButtonDisabled="selected == null"
	@click="cancel()"
	@close="cancel()"
	@ok="ok()"
	@closed="$emit('closed')"
>
	<template #header>{{ i18n.ts.selectUser }}</template>
	<div>
		<div v-if="roles.length > 0" :class="$style.roles">
			<div v-for="role in roles" :key="role.id" class="_button" :class="[$style.role, { [$style.selected]: selected && selected.id === role.id }]" @click="selected = role" @dblclick="ok()">
				<div :class="$style.roleWrapper">
					<MkRolePreview :key="role.id" :role="role" :forModeration="false" :noLink="true"/>
					<i v-if="selected && selected.id === role.id" class="ti ti-check" :class="$style.checkIcon"></i>
				</div>
			</div>
		</div>
		<div v-else :class="$style.empty">
			<span>{{ i18n.ts.noRole }}</span>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkRolePreview from './MkRolePreview.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'ok', selected: Misskey.entities.Role): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const props = withDefaults(defineProps<{
	admin?: boolean
}>(), {
	admin: false,
});

const roles = ref<Misskey.entities.Role[]>([]);
const selected = ref<Misskey.entities.Role | null>(null);
const dialogEl = ref();

function getFromApi() {
	const endpoint : keyof Misskey.Endpoints = props.admin ? 'admin/roles/list' : 'roles/list';
	misskeyApi(endpoint, {}).then(_roles => {
		roles.value = _roles;
	});
}

async function ok() {
	if (selected.value == null) return;
	const endpoint : keyof Misskey.Endpoints = props.admin ? 'admin/roles/show' : 'roles/show';

	const role = await misskeyApi(endpoint, {
		roleId: selected.value.id,
	});
	emit('ok', role);

	dialogEl.value.close();
}

function cancel() {
	emit('cancel');
	dialogEl.value.close();
}

onMounted(() => {
	getFromApi();
});
</script>

<style lang="scss" module>

.form {
	padding: calc(var(--root-margin) / 2) var(--root-margin);
}

.result {
	display: flex;
	flex-direction: column;
	overflow: auto;
	height: 100%;

	&.result.hit {
		padding: 0;
	}
}

.roles {
	flex: 1;
	overflow: auto;
	padding: 8px 0;
}

.roleWrapper {
    width: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.role {
    display: flex;
    align-items: center;
    padding: 8px var(--root-margin);
    font-size: 14px;
    border: 2px solid transparent;
    transition: all 0.2s ease;

    &:hover {
        background: var(--MI_THEME-X7);
        transform: translateX(4px);
    }

    &.selected {
        border-color: var(--MI_THEME-accent);
        background: var(--MI_THEME-X7);

        > .roleWrapper > :global(._panel) {
            background-color: var(--MI_THEME-accent) !important;
            color: var(--MI_THEME-fgOnAccent) !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
    }
}

.checkIcon {
    color: var(--MI_THEME-accent);
    font-size: 1.2em;
    margin-left: 8px;
}

.empty {
	opacity: 0.7;
	text-align: center;
	padding: 16px;
}
</style>
