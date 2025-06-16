<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-postform" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['postform', 'notes', 'posting', 'compose']">
	<MkFolder>
		<template #icon><i class="ti ti-forms"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.postForm }}</SearchLabel></template>
		<div class="_gaps_m">
			<SearchMarker :keywords="['post', 'form', 'compose']">
				<MkPreferenceContainer k="defaultScheduledNoteDeleteTime">
					<div :class="$style.label">
						<SearchLabel>{{ i18n.ts.defaultScheduledNoteDeleteTime }}</SearchLabel>
					</div>
					<MkDeleteScheduleEditor v-model="scheduledNoteDelete" :afterOnly="true"/>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['post', 'form', 'compose']">
				<MkPreferenceContainer k="defaultScheduledNoteDelete">
					<MkSwitch v-model="defaultScheduledNoteDelete">
						<SearchLabel>{{ i18n.ts.defaultScheduledNoteDelete }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['post', 'form', 'compose']">
				<MkPreferenceContainer k="useTextAreaAutoSize">
					<MkSwitch v-model="useTextAreaAutoSize">
						<template #caption><SearchLabel>{{ i18n.ts.textAreaAutoResizeDescription }}</SearchLabel></template>
						<SearchLabel>{{ i18n.ts.textAreaAutoResize }}</SearchLabel>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { watch } from 'vue';
import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import MkDeleteScheduleEditor from '@/components/MkDeleteScheduleEditor.vue';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const useTextAreaAutoSize = prefer.model('useTextAreaAutoSize');
const defaultScheduledNoteDelete = prefer.model('defaultScheduledNoteDelete');
const scheduledNoteDelete = ref({ deleteAt: null, deleteAfter: prefer.s.defaultScheduledNoteDeleteTime, isValid: true });

watch(scheduledNoteDelete, () => {
	if (!scheduledNoteDelete.value.isValid) return;
	prefer.commit('defaultScheduledNoteDeleteTime', scheduledNoteDelete.value.deleteAfter);
});

</script>

<style lang="scss" module>
.items {
    padding: 8px;
    flex: 1;
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
    grid-auto-rows: 40px;
}

.item {
    display: inline-block;
    padding: 0;
    margin: 0;
    font-size: 1em;
    width: auto;
    height: 100%;
    border-radius: 6px;

    &:hover {
        background: var(--X5);
    }
}

.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
