<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-door-enter"></i></template>
	<template #label>{{ i18n.ts._entrance.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.entranceShowTimeLine">
			<template #label>{{ i18n.ts._entrance.showTimeLine }}</template>
			<template #caption>{{ i18n.ts._entrance.showTimeLineDescription }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.entranceShowFeatured">
			<template #label>{{ i18n.ts._entrance.showFeatured }}</template>
			<template #caption>{{ i18n.ts._entrance.showFeaturedDescription }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.entranceShowEmojis">
			<template #label>{{ i18n.ts._entrance.showEmojis }}</template>
			<template #caption>{{ i18n.ts._entrance.showEmojisDescription }}</template>
		</MkSwitch>

		<MkTextarea v-model="form.state.entranceSelectEmojis">
			<template #label>{{ i18n.ts._entrance.selectEmojis }}</template>
			<template #caption>{{ i18n.ts._entrance.selectEmojisDescription }}</template>
		</MkTextarea>

		<MkSwitch v-model="form.state.entranceShowStats">
			<template #label>{{ i18n.ts._entrance.showStats }}</template>
			<template #caption>{{ i18n.ts._entrance.showStatsDescription }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.entranceShowFederation">
			<template #label>{{ i18n.ts._entrance.showFederation }}</template>
			<template #caption>{{ i18n.ts._entrance.showFederationDescription }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.entranceShowDashboard">
			<template #label>{{ i18n.ts._entrance.showDashboard }}</template>
			<template #caption>{{ i18n.ts._entrance.showDashboardDescription }}</template>
		</MkSwitch>

		<MkFolder v-if="form.state.entranceShowDashboard">
			<template #icon><i class="ti ti-home-2"></i></template>
			<template #label>{{ i18n.ts._entrance.title2 }}</template>

			<div class="_gaps_m">
				<MkSwitch v-model="form.state.entranceShowSignup">
					<template #label>{{ i18n.ts._entrance.showSignup }}</template>
					<template #caption>{{ i18n.ts._entrance.showSignupDescription }}</template>
				</MkSwitch>

				<MkSwitch v-model="form.state.entranceShowAnotherInstance">
					<template #label>{{ i18n.ts._entrance.showAnotherInstance }}</template>
					<template #caption>{{ i18n.ts._entrance.showAnotherInstanceDescription }}</template>
				</MkSwitch>

				<MkSwitch v-model="form.state.entranceShowSignin">
					<template #label>{{ i18n.ts._entrance.showSignin }}</template>
					<template #caption>{{ i18n.ts._entrance.showSigninDescription }}</template>
				</MkSwitch>
			</div>
		</MkFolder>

		<MkFolder>
			<template #icon><i class="ti ti-box-margin"></i></template>
			<template #label>{{ i18n.ts._entrance.marginSettings }}</template>

			<div class="_gaps_m">
				<MkInput :modelValue="form.state.entranceMarginLeft" type="number" :min="0" step="1" @update:modelValue="v => form.state.entranceMarginLeft = v">
					<template #label>{{ i18n.ts._entrance.marginLeft }}</template>
				</MkInput>

				<MkInput :modelValue="form.state.entranceMarginRight" type="number" :min="0" step="1" @update:modelValue="v => form.state.entranceMarginRight = v">
					<template #label>{{ i18n.ts._entrance.marginRight }}</template>
				</MkInput>

				<MkInput :modelValue="form.state.entranceMarginTop" type="number" :min="0" step="1" @update:modelValue="v => form.state.entranceMarginTop = v">
					<template #label>{{ i18n.ts._entrance.marginTop }}</template>
				</MkInput>

				<MkInput :modelValue="form.state.entranceMarginBottom" type="number" :min="0" step="1" @update:modelValue="v => form.state.entranceMarginBottom = v">
					<template #label>{{ i18n.ts._entrance.marginBottom }}</template>
				</MkInput>
			</div>
		</MkFolder>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	entranceShowTimeLine: props.meta.entranceShowTimeLine,
	entranceShowFeatured: props.meta.entranceShowFeatured,
	entranceShowEmojis: props.meta.entranceShowEmojis,
	entranceSelectEmojis: props.meta.entranceSelectEmojis.join('\n'),
	entranceShowStats: props.meta.entranceShowStats,
	entranceShowFederation: props.meta.entranceShowFederation,
	entranceShowDashboard: props.meta.entranceShowDashboard,
	entranceShowSignup: props.meta.entranceShowSignup,
	entranceShowAnotherInstance: props.meta.entranceShowAnotherInstance,
	entranceShowSignin: props.meta.entranceShowSignin,
	entranceMarginLeft: props.meta.entranceMarginLeft,
	entranceMarginRight: props.meta.entranceMarginRight,
	entranceMarginTop: props.meta.entranceMarginTop,
	entranceMarginBottom: props.meta.entranceMarginBottom,
}, async (state) => {
	const parseOptionalNonNegativeInt = (value: unknown): { value?: number; error?: string } => {
		if (value === null || value === undefined || value === '') return {};
		const numberValue = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue)) {
			return { error: 'マージン値は整数で入力してください' };
		}
		if (numberValue < 0) {
			return { error: 'マージン値は0以上の値を指定してください' };
		}
		return { value: numberValue };
	};

	const emojis = state.entranceSelectEmojis.split('\n').filter(emoji => emoji.trim() !== '');
	if (emojis.length > 5) {
		os.alert({ type: 'error', text: '表示する絵文字は最大5個までです。' });
		return;
	}

	const left = parseOptionalNonNegativeInt(state.entranceMarginLeft);
	const right = parseOptionalNonNegativeInt(state.entranceMarginRight);
	const top = parseOptionalNonNegativeInt(state.entranceMarginTop);
	const bottom = parseOptionalNonNegativeInt(state.entranceMarginBottom);
	const marginError = left.error ?? right.error ?? top.error ?? bottom.error;

	if (marginError) {
		os.alert({ type: 'error', text: marginError });
		return;
	}

	await os.apiWithDialog('admin/update-meta', {
		entranceShowTimeLine: state.entranceShowTimeLine,
		entranceShowFeatured: state.entranceShowFeatured,
		entranceShowEmojis: state.entranceShowEmojis,
		entranceSelectEmojis: state.entranceSelectEmojis.split('\n').slice(0, 5),
		entranceShowStats: state.entranceShowStats,
		entranceShowFederation: state.entranceShowFederation,
		entranceShowDashboard: state.entranceShowDashboard,
		entranceShowSignup: state.entranceShowSignup,
		entranceShowAnotherInstance: state.entranceShowAnotherInstance,
		entranceShowSignin: state.entranceShowSignin,
		entranceMarginLeft: left.value,
		entranceMarginRight: right.value,
		entranceMarginTop: top.value,
		entranceMarginBottom: bottom.value,
	});
	fetchInstance(true);
});
</script>
EOF
