<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-notebottom" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['notebottom', 'notes', 'actions']">
	<MkFolder>
		<template #icon><i class="ti ti-note"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.noteActions }}</SearchLabel></template>
		<div class="_gaps_m">
			<SearchMarker :keywords="['note', 'actions', 'buttons']">
				<MkPreferenceContainer k="noteBottomActions">
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
								<button v-tooltip="noteBottomDef[element.type].title" class="_button" :class="$style.item" @click="removeItem(element.type, $event)">
									<i class="ti ti-fw" :class="[$style.itemIcon, noteBottomDef[element.type].icon]"></i>
								</button>
							</template>
						</Sortable>
					</MkContainer>
				</MkPreferenceContainer>
			</SearchMarker>

			<div class="_buttons">
				<MkButton @click="addItem"><i class="ti ti-plus"></i>{{ i18n.ts.addItem }}</MkButton>
				<MkButton danger @click="reset"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
				<MkButton primary class="save" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
			</div>
			<div :class="$style.label"><SearchLabel>{{ i18n.ts.noteBottomSettingsDescription }}</SearchLabel></div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue';
import { noteBottomDef, defaultNoteBottomActions } from '@/utility/tempura-script/note-bottom-menu.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkContainer from '@/components/MkContainer.vue';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));

const items = ref(prefer.s.noteBottomActions.map(x => ({
	id: Math.random().toString(),
	type: x,
})) ?? defaultNoteBottomActions.map(x => ({
	id: Math.random().toString(),
	type: x,
})));

async function addItem() {
	const currentItems = items.value.map(x => x.type);
	const availableItems = Object.keys(noteBottomDef).filter(k => !currentItems.includes(k));

	const { canceled, result: item } = await os.select({
		title: i18n.ts.addItem,
		items: availableItems.map(k => ({
			value: k,
			text: noteBottomDef[k].title,
		})),
	});

	if (canceled || item == null) return;
	items.value = [...items.value, {
		id: Math.random().toString(),
		type: item,
	}];
}

function removeItem(type: keyof typeof noteBottomDef, ev: MouseEvent) {
	const item = noteBottomDef[type];
	os.popupMenu([{
		type: 'label',
		text: item.title.toString(),
	}, {
		text: i18n.ts.remove,
		action: () => {
			items.value = items.value.filter(x => x.type !== type);
		},
	}], ev.currentTarget as HTMLElement);
}

async function save() {
	prefer.commit('noteBottomActions', items.value.map(x => x.type));
}

async function reset() {
	const result = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (result.canceled) return;

	items.value = defaultNoteBottomActions.map(x => ({
		id: Math.random().toString(),
		type: x,
	}));
}
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
