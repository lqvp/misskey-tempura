<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-profile" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['profile', 'account']">
	<MkFolder>
		<template #icon><i class="ti ti-user"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.profile }}</SearchLabel></template>

		<div class="_gaps_m">
			<MkFolder v-if="$i.policies.canUpdateCounters">
				<template #label>{{ i18n.ts._updateCount.title }}</template>
				<div class="_gaps_m">
					<SearchMarker :keywords="['profile', 'followers', 'count', 'statistics']">
						<MkInput v-model="followersCount" type="number" :min="0">
							<template #label><SearchLabel>{{ i18n.ts._updateCount.updateFollowerCount }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._updateCount.updateFollowerCountDescription }}</template>
						</MkInput>
					</SearchMarker>

					<SearchMarker :keywords="['profile', 'following', 'count', 'statistics']">
						<MkInput v-model="followingCount" type="number" :min="0">
							<template #label><SearchLabel>{{ i18n.ts._updateCount.updateFollowCount }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._updateCount.updateFollowCountDescription }}</template>
						</MkInput>
					</SearchMarker>

					<SearchMarker :keywords="['profile', 'notes', 'posts', 'count', 'statistics']">
						<MkInput v-model="notesCount" type="number" :min="0">
							<template #label><SearchLabel>{{ i18n.ts._updateCount.updateNoteCount }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._updateCount.updateNoteCountDescription }}</template>
						</MkInput>
					</SearchMarker>

					<SearchMarker :keywords="['profile', 'save', 'update', 'counts']">
						<div class="_buttons">
							<MkButton primary :disabled="!hasChanges" @click="saveCounts">
								<i class="ti ti-check"></i> {{ i18n.ts.save }}
							</MkButton>
						</div>
					</SearchMarker>
				</div>
			</MkFolder>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { globalEvents } from '@/events.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import SearchLabel from '@/components/global/SearchLabel.vue';

const followersCount = ref($i.followersCount);
const followingCount = ref($i.followingCount);
const notesCount = ref($i.notesCount);

const hasChanges = computed(() => {
	return followersCount.value !== $i.followersCount ||
    followingCount.value !== $i.followingCount ||
    notesCount.value !== $i.notesCount;
});

async function saveCounts() {
	const confirm = await os.confirm({
		type: 'warning',
		title: i18n.ts._updateCount.warningTitle,
		text: i18n.ts._updateCount.warningText,
		okText: i18n.ts.update,
	});

	if (confirm.canceled) return;

	try {
		const params = {} as Record<string, number>;

		if (followersCount.value !== $i.followersCount) {
			params.followersCount = followersCount.value;
		}
		if (followingCount.value !== $i.followingCount) {
			params.followingCount = followingCount.value;
		}
		if (notesCount.value !== $i.notesCount) {
			params.notesCount = notesCount.value;
		}

		await os.apiWithDialog('i/profile-counts-control', params);

		const updatedUser = await misskeyApi('users/show', { userId: $i.id });
		Object.assign($i, updatedUser);

		globalEvents.emit('requestClearPageCache');
	} catch (err: any) {
		os.alert({
			type: 'error',
			text: err.message ?? 'Unknown error occurred',
		});
	}
}
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
