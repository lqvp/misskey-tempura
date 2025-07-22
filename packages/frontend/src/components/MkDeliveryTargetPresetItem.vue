<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder :defaultOpen="false">
	<template #header>
		<div :class="$style.header">
			<div :class="$style.presetInfo">
				<div :class="$style.presetName">
					{{ preset.name }}
					<span v-if="preset.isDefault" :class="$style.defaultBadge">
						{{ i18n.ts._deliveryTargetPreset.defaultPreset }}
					</span>
				</div>
				<div v-if="preset.description" :class="$style.presetDescription">
					{{ preset.description }}
				</div>
			</div>
			<div :class="$style.presetMeta">
				<div :class="$style.modeInfo">
					<i class="ti ti-fw" :class="modeIcon"></i>
					{{ modeText }}
				</div>
				<span v-if="preset.hosts.length > 0" :class="$style.hostCount">
					{{ i18n.tsx._deliveryTargetPreset.serverCount({ count: preset.hosts.length }) }}
				</span>
				<span v-else :class="$style.hostCount">
					{{ i18n.ts._deliveryTargetPreset.noServers }}
				</span>
			</div>
		</div>
	</template>

	<template #default>
		<div :class="$style.content">
			<div v-if="preset.hosts.length > 0" :class="$style.hostsList">
				<div v-for="host in displayHosts" :key="host" :class="$style.hostItem">
					{{ host }}
				</div>
				<div v-if="preset.hosts.length > 5" :class="$style.moreHosts">
					{{ i18n.ts.showMore }}
				</div>
			</div>
			<div v-else :class="$style.noHosts">
				{{ i18n.ts._deliveryTargetPreset.noServers }}
			</div>
		</div>

		<div :class="$style.actions">
			<MkButton size="small" @click="edit">
				<i class="ti ti-edit"></i>
				{{ i18n.ts._deliveryTargetPreset.editPreset }}
			</MkButton>
			<MkButton size="small" @click="duplicate">
				<i class="ti ti-copy"></i>
				{{ i18n.ts._deliveryTargetPreset.duplicatePreset }}
			</MkButton>
			<MkButton size="small" danger @click="del">
				<i class="ti ti-trash"></i>
				{{ i18n.ts._deliveryTargetPreset.deletePreset }}
			</MkButton>
		</div>
	</template>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import type { DeliveryTargetPreset } from '@/utility/delivery-target-preset.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';

const props = defineProps<{
	preset: DeliveryTargetPreset;
}>();

const emit = defineEmits<{
	(ev: 'updatePreset', preset: DeliveryTargetPreset): void;
	(ev: 'duplicatePreset', preset: DeliveryTargetPreset): void;
	(ev: 'deletePreset', preset: DeliveryTargetPreset): void;
}>();

const modeIcon = computed(() => {
	return props.preset.mode === 'include' ? 'ti-check' : 'ti-x';
});

const modeText = computed(() => {
	return props.preset.mode === 'include'
		? i18n.ts._deliveryTargetControl.deliveryTargetInclude
		: i18n.ts._deliveryTargetControl.deliveryTargetExclude;
});

const displayHosts = computed(() => {
	return props.preset.hosts.slice(0, 5);
});

function edit() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkDeliveryTargetPresetEditor.vue')), {
		preset: props.preset,
	}, {
		ok: (updatedPreset: DeliveryTargetPreset) => {
			emit('updatePreset', updatedPreset);
			os.alert({
				type: 'success',
				title: '成功',
				text: 'プリセットを更新しました',
			});
		},
		closed: () => dispose(),
	});
}

function duplicate() {
	emit('duplicatePreset', props.preset);
	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットを複製しました',
	});
}

async function del() {
	const result = await os.confirm({
		type: 'warning',
		text: props.preset.isDefault
			? 'デフォルトプリセットを削除しますか？'
			: 'このプリセットを削除しますか？',
	});

	if (result.canceled) return;

	emit('deletePreset', props.preset);
	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットを削除しました',
	});
}
</script>

<style lang="scss" module>
.header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
	width: 100%;
}

.presetInfo {
	flex: 1;
	min-width: 0;
}

.presetName {
	font-weight: 500;
	color: var(--MI_THEME-text);
	display: flex;
	align-items: center;
	gap: 8px;
}

.defaultBadge {
	font-size: 0.75em;
	padding: 2px 6px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-accentForeground);
	border-radius: 4px;
	font-weight: normal;
}

.presetDescription {
	font-size: 0.85em;
	color: var(--MI_THEME-text);
	opacity: 0.7;
	margin-top: 4px;
}

.presetMeta {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 4px;
	font-size: 0.85em;
}

.modeInfo {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--MI_THEME-accent);
	font-weight: 500;
}

.hostCount {
	color: var(--MI_THEME-text);
	opacity: 0.7;
}

.content {
	padding: 12px 0;
}

.hostsList {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.hostItem {
	padding: 4px 8px;
	background: var(--MI_THEME-background);
	border: 1px solid var(--MI_THEME-border);
	border-radius: 4px;
	font-family: monospace;
	font-size: 0.85em;
	color: var(--MI_THEME-text);
}

.moreHosts {
	font-size: 0.8em;
	color: var(--MI_THEME-text);
	opacity: 0.6;
	text-align: center;
	padding: 4px;
}

.noHosts {
	text-align: center;
	color: var(--MI_THEME-text);
	opacity: 0.6;
	font-style: italic;
	padding: 12px;
}

.actions {
	display: flex;
	gap: 8px;
	padding-top: 12px;
	border-top: 1px solid var(--MI_THEME-border);
}
</style>
