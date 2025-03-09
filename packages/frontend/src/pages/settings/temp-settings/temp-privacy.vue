<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="temp-settings" :keywords="['privacy']">
	<MkFolder>
		<template #icon><i class="ti ti-lock-open"></i></template>
		<template #label>{{ i18n.ts.privacy }}</template>
		<div class="_gaps_m">
			<MkSwitch v-if="!isLocked" v-model="autoRejectFollowRequest" @update:modelValue="save_privacy()">
				{{ i18n.ts.autoRejectFollowRequest }}
				<template #caption>{{ i18n.ts.autoRejectFollowRequestDescription }}</template>
			</MkSwitch>
			<MkSwitch v-if="!isLocked" v-model="carefulBot" @update:modelValue="save_privacy()">{{ i18n.ts.carefulBot }}<template #caption>{{ i18n.ts.carefulBotDescription }}</template></MkSwitch>

			<MkSwitch v-if="$i.policies.canAutoFollowBack" v-model="autoFollowBack" @update:modelValue="save_privacy()">
				{{ i18n.ts.autoFollowBack }}
				<template #caption>{{ i18n.ts.autoFollowBackDescription }}</template>
			</MkSwitch>

			<MkSwitch v-model="hideActivity" @update:modelValue="save_privacy()">
				{{ i18n.ts.hideActivity }}
				<template #caption>{{ i18n.ts.hideActivityDescription }}</template>
			</MkSwitch>

			<MkSwitch v-model="hideNoteFromOverview" @update:modelValue="save_privacy()">
				{{ i18n.ts.hideNoteFromOverview }}
				<template #caption>{{ i18n.ts.hideNoteFromOverviewDescription }}</template>
			</MkSwitch>

			<MkSwitch v-model="hidePublicNotes" @update:modelValue="save_privacy()">
				{{ i18n.ts.hidePublicNotes }}
				<template #caption>{{ i18n.ts.hidePublicNotesDescription }}</template>
			</MkSwitch>

			<MkSwitch v-model="hideHomeNotes" @update:modelValue="save_privacy()">
				{{ i18n.ts.hideHomeNotes }}
				<template #caption>{{ i18n.ts.hideHomeNotesDescription }}</template>
			</MkSwitch>

			<MkSwitch v-model="hideLocalOnlyNotes" @update:modelValue="save_privacy()">
				{{ i18n.ts.hideLocalOnlyNotes }}
				<template #caption>{{ i18n.ts.hideLocalOnlyNotesDescription }}</template>
			</MkSwitch>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';
import { signinRequired } from '@/account.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

const $i = signinRequired();
const isLocked = ref($i.isLocked);

const autoRejectFollowRequest = ref($i.autoRejectFollowRequest);
const autoFollowBack = ref($i.autoFollowBack);
const carefulBot = ref($i.carefulBot);
const hideActivity = ref($i.hideActivity);
const hideNoteFromOverview = ref($i.hideNoteFromOverview);
const hidePublicNotes = ref($i.hidePublicNotes);
const hideHomeNotes = ref($i.hideHomeNotes);
const hideLocalOnlyNotes = ref($i.hideLocalOnlyNotes);

function save_privacy() {
	misskeyApi('i/update', {
		autoRejectFollowRequest: !!autoRejectFollowRequest.value,
		autoFollowBack: !!autoFollowBack.value,
		carefulBot: !!carefulBot.value,
		hideActivity: !!hideActivity.value,
		hideNoteFromOverview: !!hideNoteFromOverview.value,
		hidePublicNotes: !!hidePublicNotes.value,
		hideHomeNotes: !!hideHomeNotes.value,
		hideLocalOnlyNotes: !!hideLocalOnlyNotes.value,
	});
}
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
