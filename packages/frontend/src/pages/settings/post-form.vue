/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

<template>
<div class="_gaps_m">
	<FormSlot>
		<template #label>{{ i18n.ts.postForm }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
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
	</FormSlot>
	<div class="_buttons">
		<MkButton @click="addItem"><i class="ti ti-plus"></i> {{ i18n.ts.addItem }}</MkButton>
		<MkButton danger @click="reset"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
		<MkButton primary class="save" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
	</div>
	<div :class="$style.label">{{ i18n.ts.postFormBottomSettingsDescription }}</div>

	<MkPreferenceContainer k="defaultScheduledNoteDeleteTime">
		<div>
			<div :class="$style.label">
				{{ i18n.ts.defaultScheduledNoteDeleteTime }}
				<span class="_beta">{{ i18n.ts.originalFeature }}</span>
			</div>
			<MkDeleteScheduleEditor v-model="scheduledNoteDelete" :afterOnly="true"/>
		</div>
	</MkPreferenceContainer>

	<MkPreferenceContainer k="defaultScheduledNoteDelete">
		<MkSwitch v-model="defaultScheduledNoteDelete">
			{{ i18n.ts.defaultScheduledNoteDelete }}
			<span class="_beta">{{ i18n.ts.originalFeature }}</span>
		</MkSwitch>
	</MkPreferenceContainer>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkDeleteScheduleEditor from '@/components/MkDeleteScheduleEditor.vue';
import FormSlot from '@/components/form/slot.vue';
import MkContainer from '@/components/MkContainer.vue';
import { bottomItemDef } from '@/utility/post-form.js';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const defaultScheduledNoteDelete = prefer.model('defaultScheduledNoteDelete');

const scheduledNoteDelete = ref({ deleteAt: null, deleteAfter: prefer.s.defaultScheduledNoteDeleteTime, isValid: true });

watch(scheduledNoteDelete, () => {
	if (!scheduledNoteDelete.value.isValid) return;
	prefer.commit('defaultScheduledNoteDeleteTime', scheduledNoteDelete.value.deleteAfter);
});

const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));

const items = ref(prefer.s.postFormActions.map(x => ({
	id: Math.random().toString(),
	type: x,
})));

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

function getHTMLElement(ev: MouseEvent): HTMLElement {
	const target = ev.currentTarget ?? ev.target;
	return target as HTMLElement;
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

async function save() {
	prefer.commit('postFormActions', items.value.map(x => x.type));
}

async function reset() {
	const result = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (result.canceled) return;

	items.value = store.def.postFormActions.default.map(x => ({
		id: Math.random().toString(),
		type: x,
	}));
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.postForm,
	icon: 'ti ti-pencil',
}));
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
