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
				<MkPreferenceContainer k="postFormActions">
					<MkContainer :showHeader="false">
						<Sortable
							v-model="items"
							:class="$style.items"
							:itemKey="items => items"
							:animation="100"
							:delay="50"
							:delayOnTouchOnly="true"
						>
							<template #item="{element}">
								<button v-tooltip="bottomItemDef[element.type].title" class="_button" :class="$style.item" @click="removeItem(element.type, $event)">
									<i class="ti ti-fw" :class="[$style.itemIcon, bottomItemDef[element.type].icon]"></i>
								</button>
							</template>
						</Sortable>
					</MkContainer>
				</MkPreferenceContainer>
			</SearchMarker>

			<div class="_buttons">
				<MkButton @click="addItem"><i class="ti ti-plus"></i>{{ i18n.ts.addItem }}</MkButton>
				<MkButton danger @click="reset_postform"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
				<MkButton primary class="save" @click="save_postform"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
			</div>
			<div :class="$style.label"><SearchLabel>{{ i18n.ts.postFormBottomSettingsDescription }}</SearchLabel></div>

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

			<SearchMarker :keywords="['post', 'form', 'compose']">
				<MkPreferenceContainer k="chooseFileFrom">
					<MkSelect v-model="chooseFileFrom">
						<template #label><SearchLabel>{{ i18n.ts.chooseFileFrom }}</SearchLabel></template>
						<template #caption><SearchLabel>{{ i18n.ts.chooseFileFromDescription }}</SearchLabel></template>
						<option value="new">{{ i18n.ts._chooseFileFrom.new }}</option>
						<option value="old">{{ i18n.ts._chooseFileFrom.old }}</option>
					</MkSelect>
				</MkPreferenceContainer>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { defineAsyncComponent, ref } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { prefer } from '@/preferences.js';
import { PREF_DEF } from '@/preferences/def.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkContainer from '@/components/MkContainer.vue';
import MkDeleteScheduleEditor from '@/components/MkDeleteScheduleEditor.vue';
import { bottomItemDef } from '@/utility/post-form.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const useTextAreaAutoSize = prefer.model('useTextAreaAutoSize');
const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));
const defaultScheduledNoteDelete = prefer.model('defaultScheduledNoteDelete');
const scheduledNoteDelete = ref({ deleteAt: null, deleteAfter: prefer.s.defaultScheduledNoteDeleteTime, isValid: true });
const chooseFileFrom = prefer.model('chooseFileFrom');

const items = ref(prefer.s.postFormActions.map(x => ({
	id: Math.random().toString(),
	type: x,
})));

function getHTMLElement(ev: MouseEvent): HTMLElement {
	const target = ev.currentTarget ?? ev.target;
	return target as HTMLElement;
}

async function addItem() {
	const currentItems = items.value.map(x => x.type);
	const bottomItem = Object.keys(bottomItemDef).filter(k => !currentItems.includes(k));
	const { canceled, result: item } = await os.select({
		title: i18n.ts.addItem,
		items: bottomItem.map(k => ({
			value: k, text: bottomItemDef[k].title,
		})),
	});
	if (canceled || item == null) return;
	items.value = [...items.value, {
		id: Math.random().toString(),
		type: item,
	}];
}

function removeItem(type: keyof typeof bottomItemDef, ev: MouseEvent) {
	const item = bottomItemDef[type];
	os.popupMenu([{
		type: 'label',
		text: item.title,
	}, {
		text: i18n.ts.remove,
		action: () => {
			items.value = items.value.filter(x => x.type !== type);
		},
	}], getHTMLElement(ev));
}

async function save_postform() {
	prefer.commit('postFormActions', items.value.map(x => x.type));
}

async function reset_postform() {
	const result = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (result.canceled) return;

	items.value = PREF_DEF.postFormActions.default.map(x => ({
		id: Math.random().toString(),
		type: x,
	}));
	save_postform();
}

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
