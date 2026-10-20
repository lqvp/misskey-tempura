<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-flower"></i></template>
	<template #label>はなみすきー風LP<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.useHanaEntrance" #suffix>Enabled</template>
	<template v-else #suffix>Disabled</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.useHanaEntrance">
			<template #label>{{ i18n.ts._hana.useHanaEntrance }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
		</MkSwitch>

		<MkInput v-model="form.state.hanaThemeColor" type="text" pattern="^#([A-Fa-f0-9]{6})$" maxlength="7">
			<template #label><span>{{ i18n.ts._hana.hanaThemeColor }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaThemeColorDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaThemeAltColor" type="text" pattern="^#([A-Fa-f0-9]{6})$" maxlength="7">
			<template #label><span>{{ i18n.ts._hana.hanaThemeAltColor }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaThemeAltColorDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaThemeWeakOpacity" type="number" :min="0" :max="1" step="0.1">
			<template #label><span>{{ i18n.ts._hana.hanaThemeWeakOpacity }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaThemeWeakOpacityDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaModeIcon" type="url">
			<template #label><span>{{ i18n.ts._hana.hanaModeIcon }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaModeIconDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaModeIconSize" type="number" :min="0">
			<template #label><span>{{ i18n.ts._hana.hanaModeIconSize }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaModeIconSizeDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaModeIconRadius" type="number" :min="0" :max="100">
			<template #label><span>{{ i18n.ts._hana.hanaModeIconRadius }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaModeIconRadiusDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.hanaModeBackground" type="url">
			<template #label><span>{{ i18n.ts._hana.hanaModeBackground }}</span><span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
			<template #caption>{{ i18n.ts._hana.hanaModeBackgroundDescription }}</template>
		</MkInput>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	useHanaEntrance: props.meta.useHanaEntrance,
	hanaThemeColor: props.meta.hanaThemeColor || '#fd709a',
	hanaThemeAltColor: props.meta.hanaThemeAltColor || '#f77062',
	hanaThemeWeakOpacity: props.meta.hanaThemeWeakOpacity || 0.2,
	hanaModeIcon: props.meta.hanaModeIcon ?? null,
	hanaModeIconSize: props.meta.hanaModeIconSize || 128,
	hanaModeIconRadius: props.meta.hanaModeIconRadius ?? 50,
	hanaModeBackground: props.meta.hanaModeBackground ?? null,
}, async (state) => {
	const hexColorRegex = /^#([A-Fa-f0-9]{6})$/;
	if (!hexColorRegex.test(state.hanaThemeColor) || !hexColorRegex.test(state.hanaThemeAltColor)) {
		os.alert({ type: 'error', text: 'カラーコードの形式が正しくありません (#000000 形式で入力してください)' });
		return;
	}
	if (state.hanaThemeWeakOpacity < 0 || state.hanaThemeWeakOpacity > 1) {
		os.alert({ type: 'error', text: '透明度は0から1の間で指定してください' });
		return;
	}
	if (state.hanaModeIconSize < 0) {
		os.alert({ type: 'error', text: 'アイコンサイズは0以上の値を指定してください' });
		return;
	}
	if (state.hanaModeIconRadius < 0 || state.hanaModeIconRadius > 100) {
		os.alert({ type: 'error', text: '角丸の値は0から100の間で設定してください' });
		return;
	}
	await os.apiWithDialog('admin/update-meta', {
		useHanaEntrance: state.useHanaEntrance,
		hanaThemeColor: state.hanaThemeColor,
		hanaThemeAltColor: state.hanaThemeAltColor,
		hanaThemeWeakOpacity: state.hanaThemeWeakOpacity,
		hanaModeIcon: state.hanaModeIcon,
		hanaModeIconSize: state.hanaModeIconSize,
		hanaModeIconRadius: state.hanaModeIconRadius,
		hanaModeBackground: state.hanaModeBackground,
	});
	fetchInstance(true);
});
</script>
