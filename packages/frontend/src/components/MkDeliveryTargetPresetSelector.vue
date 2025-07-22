<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="currentPreset" :class="$style.currentPreset">
		<div :class="$style.presetInfo">
			<div :class="$style.presetName">
				{{ currentPreset.name }}
				<span v-if="currentPreset.isDefault" :class="$style.defaultBadge">
					{{ i18n.ts._deliveryTargetPreset.defaultPreset }}
				</span>
			</div>
			<div :class="$style.presetHosts">
				{{ i18n.tsx._deliveryTargetPreset.serverCount({ count: currentPreset.hosts.length }) }}
			</div>
		</div>
		<div :class="$style.presetActions">
			<MkButton size="small" @click="editPreset">
				<i class="ti ti-edit"></i>
				{{ i18n.ts._deliveryTargetPreset.editPreset }}
			</MkButton>
			<MkButton size="small" @click="clearPreset">
				<i class="ti ti-x"></i>
				{{ i18n.ts.cancel }}
			</MkButton>
		</div>
	</div>

	<div v-else :class="$style.presetSelector">
		<div :class="$style.selectorHeader">
			<span>{{ i18n.ts._deliveryTargetPreset.selectPreset }}</span>
		</div>

		<div v-if="presets.length === 0" :class="$style.noPresets">
			{{ i18n.ts._deliveryTargetPreset.noPresets }}
		</div>

		<div v-else :class="$style.presetList">
			<div
				v-for="preset in presets"
				:key="preset.id"
				:class="$style.presetItem"
				@click="selectPreset(preset)"
			>
				<div :class="$style.presetItemInfo">
					<i class="ti ti-fw" :class="getModeIcon(preset.mode)"></i>
					{{ i18n.tsx._deliveryTargetPreset.serverCount({ count: preset.hosts.length }) }}
				</div>
				<div :class="$style.presetItemName">
					{{ preset.name }}
					<span v-if="preset.isDefault" :class="$style.defaultBadge">
						{{ i18n.ts._deliveryTargetPreset.defaultPreset }}
					</span>
				</div>
			</div>
		</div>

		<div :class="$style.actions">
			<MkButton size="small" @click="saveAsPreset">
				<i class="ti ti-save"></i>
				{{ i18n.ts._deliveryTargetPreset.saveAsPreset }}
			</MkButton>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import type { DeliveryTargetPreset } from '@/utility/delivery-target-preset.js';
import type { DeliveryTargetEditorModelValue } from '@/components/MkDeliveryTargetEditor.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/MkButton.vue';
import { createDeliveryTargetPreset } from '@/utility/delivery-target-preset.js';

const props = defineProps<{
	modelValue: DeliveryTargetEditorModelValue | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: DeliveryTargetEditorModelValue | null): void;
	(ev: 'presetSelected', preset: DeliveryTargetPreset): void;
	(ev: 'presetCleared'): void;
}>();

const presets = computed(() => prefer.r.deliveryTargetPresets.value);

const currentPreset = computed(() => {
	if (!props.modelValue || !props.modelValue.hosts || props.modelValue.hosts.length === 0) {
		return null;
	}

	return presets.value.find(preset =>
		preset.mode === props.modelValue!.mode &&
		JSON.stringify(preset.hosts.sort()) === JSON.stringify(props.modelValue!.hosts.sort()),
	) || null;
});

function getModeIcon(mode: 'include' | 'exclude'): string {
	return mode === 'include' ? 'ti-check' : 'ti-x';
}

function selectPreset(preset: DeliveryTargetPreset) {
	emit('update:modelValue', {
		mode: preset.mode,
		hosts: [...preset.hosts],
	});
	emit('presetSelected', preset);
}

function clearPreset() {
	emit('update:modelValue', null);
	emit('presetCleared');
}

function editPreset() {
	if (!currentPreset.value) return;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkDeliveryTargetPresetEditor.vue')), {
		preset: currentPreset.value,
	}, {
		ok: (updatedPreset: DeliveryTargetPreset) => {
			// プリセットを更新
			const index = presets.value.findIndex(p => p.id === updatedPreset.id);
			if (index !== -1) {
				const updatedPresets = [...presets.value];
				updatedPresets[index] = updatedPreset;
				prefer.commit('deliveryTargetPresets', updatedPresets);
			}

			// 現在の選択も更新
			emit('update:modelValue', {
				mode: updatedPreset.mode,
				hosts: [...updatedPreset.hosts],
			});

			os.alert({
				type: 'success',
				title: '成功',
				text: 'プリセットを更新しました',
			});
		},
		closed: () => dispose(),
	});
}

function saveAsPreset() {
	if (!props.modelValue || !props.modelValue.hosts || props.modelValue.hosts.length === 0) {
		os.alert({
			type: 'warning',
			title: '警告',
			text: 'サーバーを選択してください',
		});
		return;
	}

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkDeliveryTargetPresetEditor.vue')), {
		preset: createDeliveryTargetPreset({
			mode: props.modelValue.mode,
			hosts: [...props.modelValue.hosts],
		}),
	}, {
		ok: (newPreset: DeliveryTargetPreset) => {
			// 新しいプリセットを追加
			prefer.commit('deliveryTargetPresets', [...presets.value, newPreset]);

			// 現在の選択を更新
			emit('update:modelValue', {
				mode: newPreset.mode,
				hosts: [...newPreset.hosts],
			});

			os.alert({
				type: 'success',
				title: '成功',
				text: 'プリセットとして保存しました',
			});
		},
		closed: () => dispose(),
	});
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.currentPreset {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: 12px;
	background: var(--MI_THEME-background);
	border: 1px solid var(--MI_THEME-border);
	border-radius: 8px;
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
	margin-bottom: 4px;
}

.defaultBadge {
	font-size: 0.75em;
	padding: 2px 6px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-accentForeground);
	border-radius: 4px;
	font-weight: normal;
}

.presetHosts {
	font-size: 0.85em;
	color: var(--MI_THEME-text);
	opacity: 0.7;
}

.presetActions {
	display: flex;
	gap: 8px;
}

.presetSelector {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.selectorHeader {
	font-weight: 500;
	color: var(--MI_THEME-text);
	font-size: 0.9em;
}

.noPresets {
	text-align: center;
	color: var(--MI_THEME-text);
	opacity: 0.6;
	font-style: italic;
	padding: 16px;
	background: var(--MI_THEME-background);
	border: 1px solid var(--MI_THEME-border);
	border-radius: 8px;
}

.presetList {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-height: 200px;
	overflow-y: auto;
	border: 1px solid var(--MI_THEME-border);
	border-radius: 8px;
	padding: 8px;
	background: var(--MI_THEME-background);
}

.presetItem {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: 8px;
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;

	&:hover {
		background: var(--MI_THEME-hover);
	}
}

.presetItemInfo {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.85em;
	color: var(--MI_THEME-accent);
	font-weight: 500;
}

.presetItemName {
	font-weight: 500;
	color: var(--MI_THEME-text);
	display: flex;
	align-items: center;
	gap: 8px;
}

.actions {
	display: flex;
	justify-content: center;
}
</style>
