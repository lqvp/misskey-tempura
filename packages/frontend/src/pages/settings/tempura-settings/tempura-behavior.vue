<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-behavior" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['behavior', 'interaction', 'actions', 'default']">
	<MkFolder>
		<template #icon><i class="ti ti-mood-happy"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.behavior }}</SearchLabel></template>
		<div class="_gaps_m">
			<div class="_gaps_m">
				<MkPreferenceContainer k="reactionChecksMuting">
					<SearchMarker :keywords="['reaction', 'muting', 'block', 'ignore', 'notifications']">
						<MkSwitch v-model="reactionChecksMuting">
							<SearchLabel>{{ i18n.ts._reactionChecksMuting.title }}</SearchLabel>
							<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>

				<MkPreferenceContainer k="anonymizeMutedUsers">
					<SearchMarker :keywords="['anonymize', 'muted', 'users']">
						<MkSwitch v-model="anonymizeMutedUsers">
							<SearchLabel>{{ i18n.ts.anonymizeMutedUsers }}</SearchLabel>
							<template #caption>{{ i18n.ts._anonymizeMutedUsers.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const reactionChecksMuting = prefer.model('reactionChecksMuting');
const anonymizeMutedUsers = prefer.model('anonymizeMutedUsers');

</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
