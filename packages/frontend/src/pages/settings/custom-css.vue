<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<FormInfo warn>{{ i18n.ts.customCssWarn }}</FormInfo>

	<MkCodeEditor v-model="localCustomCss" manualSave lang="css">
		<template #label>CSS</template>
	</MkCodeEditor>
	
	<div class="_buttons" style="margin-top: 16px;">
		<MkButton inline @click="backup"><i class="ti ti-download"></i> {{ i18n.ts.backup }}</MkButton>
		<MkButton inline @click="restore"><i class="ti ti-upload"></i> {{ i18n.ts.restore }}</MkButton>
		<MkButton v-if="$i" inline @click="cloudBackup"><i class="ti ti-cloud-upload"></i> {{ i18n.ts._preferencesBackup.saveOnDevice }}</MkButton>
		<MkButton v-if="$i" inline @click="cloudRestore"><i class="ti ti-cloud-download"></i> {{ i18n.ts._preferencesBackup.loadFromDevice }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import MkCodeEditor from '@/components/MkCodeEditor.vue';
import MkButton from '@/components/MkButton.vue';
import FormInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

const localCustomCss = ref(miLocalStorage.getItem('customCss') ?? '');

async function apply() {
	miLocalStorage.setItem('customCss', localCustomCss.value);

	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.ts.reloadToApplySetting,
	});
	if (canceled) return;

	unisonReload();
}

watch(localCustomCss, async () => {
	await apply();
});

async function backup() {
	const date = new Date();
	const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}`;
	const fileName = `custom-css-backup_${timestamp}.css`;
	
	const blob = new Blob([localCustomCss.value], { type: 'text/css' });
	const url = URL.createObjectURL(blob);
	
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	
	URL.revokeObjectURL(url);
	
	os.success();
}

async function restore() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.css,text/css';
	
	input.onchange = async (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = async (e) => {
			const content = e.target?.result as string;
			if (content) {
				const { canceled } = await os.confirm({
					type: 'warning',
					text: i18n.ts.overwriteConfirm,
				});
				
				if (!canceled) {
					localCustomCss.value = content;
					await apply();
				}
			}
		};
		reader.readAsText(file);
	};
	
	input.click();
}

async function cloudBackup() {
	if (!$i) return;
	
	const date = new Date();
	const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}`;
	const key = `css_${timestamp}`;
	
	try {
		await misskeyApi('i/registry/set', {
			scope: ['client', 'customCss', 'backups'],
			key,
			value: localCustomCss.value,
		});
		
		os.success();
	} catch (e) {
		os.alert({
			type: 'error',
			text: e.message,
		});
	}
}

async function cloudRestore() {
	if (!$i) return;
	
	try {
		const keys = await misskeyApi('i/registry/keys', {
			scope: ['client', 'customCss', 'backups'],
		});
		
		if (keys.length === 0) {
			os.alert({
				type: 'warning',
				text: i18n.ts._preferencesBackup.noBackupsFound,
			});
			return;
		}
		
		const select = await os.select({
			title: i18n.ts._preferencesBackup.selectBackup,
			items: keys.map(key => ({
				text: key,
				value: key,
			})),
		});
		
		if (select.canceled || !select.result) return;
		
		const backup = await misskeyApi('i/registry/get', {
			scope: ['client', 'customCss', 'backups'],
			key: select.result,
		});
		
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.overwriteConfirm,
		});
		
		if (!canceled) {
			localCustomCss.value = backup;
			await apply();
		}
	} catch (e) {
		os.alert({
			type: 'error',
			text: e.message,
		});
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.customCss,
	icon: 'ti ti-code',
}));
</script>
