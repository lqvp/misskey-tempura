<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-delivery-targets" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['delivery', 'target', 'preset', 'federation']">
	<MkFolder>
		<template #icon><i class="ti ti-server-2"></i></template>
		<template #label><SearchLabel>{{ i18n.ts._deliveryTargetPreset.title }}</SearchLabel></template>
		<template #caption><SearchLabel>{{ i18n.ts._deliveryTargetPreset.description }}</SearchLabel></template>

		<div class="_gaps_m">
			<div class="_buttons">
				<MkButton @click="createPreset"><i class="ti ti-plus"></i> {{ i18n.ts._deliveryTargetPreset.createPreset }}</MkButton>
				<MkButton @click="refreshPage"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
			</div>

			<div v-if="presets.length === 0" :class="$style.noPresets">
				<div :class="$style.noPresetsIcon">
					<i class="ti ti-server-2"></i>
				</div>
				<div :class="$style.noPresetsText">
					{{ i18n.ts._deliveryTargetPreset.noPresets }}
				</div>
			</div>

			<div v-else :class="$style.presetList">
				<MkDeliveryTargetPresetItem
					v-for="preset in sortedPresets"
					:key="preset.id"
					:preset="preset"
					@updatePreset="updatePreset"
					@duplicatePreset="duplicatePreset"
					@deletePreset="deletePreset"
				/>
			</div>

			<div class="_buttons">
				<MkButton @click="importPresets"><i class="ti ti-download"></i> {{ i18n.ts._deliveryTargetPreset.importPreset }}</MkButton>
				<MkButton v-if="presets.length > 0" @click="exportPresets"><i class="ti ti-upload"></i> {{ i18n.ts._deliveryTargetPreset.exportPreset }}</MkButton>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue';
import type { DeliveryTargetPreset } from '@/utility/delivery-target-preset.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import MkDeliveryTargetPresetItem from '@/components/MkDeliveryTargetPresetItem.vue';
import { createDeliveryTargetPreset, duplicateDeliveryTargetPreset } from '@/utility/delivery-target-preset.js';

const presets = computed(() => prefer.r.deliveryTargetPresets.value);

const sortedPresets = computed(() => {
	return [...presets.value].sort((a, b) => {
		// デフォルトプリセットを最初に
		if (a.isDefault && !b.isDefault) return -1;
		if (!a.isDefault && b.isDefault) return 1;
		// 作成日時で降順
		return b.createdAt - a.createdAt;
	});
});

async function createPreset() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkDeliveryTargetPresetEditor.vue')), {
		preset: null,
	}, {
		ok: (preset: DeliveryTargetPreset) => {
			// デフォルトプリセットが設定された場合、他のプリセットのデフォルトを解除
			if (preset.isDefault) {
				const updatedPresets = prefer.r.deliveryTargetPresets.value.map(p => ({
					...p,
					isDefault: false,
				}));
				prefer.commit('deliveryTargetPresets', [...updatedPresets, preset]);
			} else {
				prefer.commit('deliveryTargetPresets', [...prefer.r.deliveryTargetPresets.value, preset]);
			}
			os.alert({
				type: 'success',
				title: '成功',
				text: 'プリセットを作成しました',
			});
			// リアクティビティによって自動的に更新されるため、reloadProfileは不要
		},
		closed: () => dispose(),
	});
}

function updatePreset(preset: DeliveryTargetPreset) {
	const index = prefer.r.deliveryTargetPresets.value.findIndex(p => p.id === preset.id);
	if (index === -1) return;

	// デフォルトプリセットが設定された場合、他のプリセットのデフォルトを解除
	if (preset.isDefault) {
		const updatedPresets = prefer.r.deliveryTargetPresets.value.map(p => ({
			...p,
			isDefault: false,
		}));
		updatedPresets[index] = { ...preset, isDefault: true };
		prefer.commit('deliveryTargetPresets', updatedPresets);
	} else {
		const updatedPresets = [...prefer.r.deliveryTargetPresets.value];
		updatedPresets[index] = preset;
		prefer.commit('deliveryTargetPresets', updatedPresets);
	}

	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットを更新しました',
	});
}

function duplicatePreset(preset: DeliveryTargetPreset) {
	const duplicated = duplicateDeliveryTargetPreset(preset);
	prefer.commit('deliveryTargetPresets', [...prefer.r.deliveryTargetPresets.value, duplicated]);
	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットを複製しました',
	});
}

async function deletePreset(preset: DeliveryTargetPreset) {
	const result = await os.confirm({
		type: 'warning',
		text: preset.isDefault ? 'デフォルトプリセットを削除しますか？' : 'このプリセットを削除しますか？',
	});
	if (result.canceled) return;

	const updatedPresets = prefer.r.deliveryTargetPresets.value.filter(p => p.id !== preset.id);
	prefer.commit('deliveryTargetPresets', updatedPresets);

	// デフォルトプリセットが削除された場合、デフォルトIDもクリア
	if (preset.isDefault) {
		prefer.commit('defaultDeliveryTargetPresetId', null);
	}

	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットを削除しました',
	});
}

async function importPresets() {
	const input = window.document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = async (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			if (!Array.isArray(data)) {
				throw new Error('Invalid preset data format');
			}

			// バリデーション
			for (const preset of data) {
				if (!preset.id || !preset.name || !preset.mode || !Array.isArray(preset.hosts)) {
					throw new Error('Invalid preset data');
				}
			}

			// 既存のプリセットとマージ（ID重複は無視）
			const existingIds = new Set(prefer.r.deliveryTargetPresets.value.map(p => p.id));
			const newPresets = data.filter(p => !existingIds.has(p.id));

			if (newPresets.length === 0) {
				os.alert({
					type: 'info',
					title: i18n.ts.info,
					text: 'すべてのプリセットが既に存在します',
				});
				return;
			}

			prefer.commit('deliveryTargetPresets', [...prefer.r.deliveryTargetPresets.value, ...newPresets]);
			os.alert({
				type: 'success',
				title: '成功',
				text: 'プリセットをインポートしました',
			});
		} catch (err) {
			console.error('Failed to import presets:', err);
			os.alert({
				type: 'error',
				title: i18n.ts.error,
				text: '無効なプリセットデータです',
			});
		}
	};
	input.click();
}

function exportPresets() {
	const dataStr = JSON.stringify(presets.value, null, 2);
	const dataBlob = new Blob([dataStr], { type: 'application/json' });
	const url = URL.createObjectURL(dataBlob);
	const link = window.document.createElement('a');
	link.href = url;
	link.download = `delivery-target-presets-${new Date().toISOString().split('T')[0]}.json`;
	link.click();
	URL.revokeObjectURL(url);
	os.alert({
		type: 'success',
		title: '成功',
		text: 'プリセットをエクスポートしました',
	});
}

function refreshPage() {
	// リアクティビティを強制的に更新
	prefer.r.deliveryTargetPresets.value = [...prefer.r.deliveryTargetPresets.value];
}
</script>

<style lang="scss" module>
.noPresets {
	text-align: center;
	padding: 32px 16px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.noPresetsIcon {
	font-size: 3em;
	margin-bottom: 16px;
	opacity: 0.5;
}

.noPresetsText {
	font-size: 1.1em;
	margin-bottom: 16px;
}

.presetList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
</style>
