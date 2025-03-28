<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-privacy" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['privacy', 'security', 'visibility', 'permission']">
	<MkFolder>
		<template #icon><i class="ti ti-lock-open"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.privacy }}</SearchLabel></template>
		<div class="_gaps_m">
			<SearchMarker :keywords="['follow', 'reject', 'auto']">
				<MkSwitch v-model="autoRejectFollowRequest" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.autoRejectFollowRequest }}</SearchLabel>
					<template #caption>{{ i18n.ts.autoRejectFollowRequestDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['bot', 'careful']">
				<MkSwitch v-model="carefulBot" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.carefulBot }}</SearchLabel>
					<template #caption>{{ i18n.ts.carefulBotDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['follow', 'back', 'auto']">
				<MkSwitch v-if="$i.policies.canAutoFollowBack" v-model="autoFollowBack" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.autoFollowBack }}</SearchLabel>
					<template #caption>{{ i18n.ts.autoFollowBackDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['activity', 'hide']">
				<MkSwitch v-model="hideActivity" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.hideActivity }}</SearchLabel>
					<template #caption>{{ i18n.ts.hideActivityDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['note', 'overview', 'hide']">
				<MkSwitch v-model="hideNoteFromOverview" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.hideNoteFromOverview }}</SearchLabel>
					<template #caption>{{ i18n.ts.hideNoteFromOverviewDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['note', 'public', 'hide']">
				<MkSwitch v-model="hidePublicNotes" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.hidePublicNotes }}</SearchLabel>
					<template #caption>{{ i18n.ts.hidePublicNotesDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['note', 'home', 'hide']">
				<MkSwitch v-model="hideHomeNotes" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.hideHomeNotes }}</SearchLabel>
					<template #caption>{{ i18n.ts.hideHomeNotesDescription }}</template>
				</MkSwitch>
			</SearchMarker>

			<SearchMarker :keywords="['note', 'local', 'hide']">
				<MkSwitch v-model="hideLocalOnlyNotes" @update:modelValue="save_privacy()">
					<SearchLabel>{{ i18n.ts.hideLocalOnlyNotes }}</SearchLabel>
					<template #caption>{{ i18n.ts.hideLocalOnlyNotesDescription }}</template>
				</MkSwitch>
			</SearchMarker>
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
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';

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
