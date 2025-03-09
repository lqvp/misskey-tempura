<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="temp-settings" :keywords="['postform']">
	<MkFolder>
		<template #icon><i class="ti ti-forms"></i></template>
		<template #label>{{ i18n.ts.postForm }}</template>
		<div class="_gaps_m">
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
			<div class="_buttons">
				<MkButton @click="addItem"><i class="ti ti-plus"></i> {{ i18n.ts.addItem }}</MkButton>
				<MkButton danger @click="reset_postform"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
				<MkButton primary class="save" @click="save_postform"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
			</div>
			<div :class="$style.label">{{ i18n.ts.postFormBottomSettingsDescription }}</div>
			<div>
				<div :class="$style.label">
					{{ i18n.ts.defaultScheduledNoteDeleteTime }}
				</div>
				<MkDeleteScheduleEditor v-model="scheduledNoteDelete" :afterOnly="true"/>
			</div>
			<div class="_gaps_m">
				<MkSwitch v-model="defaultScheduledNoteDelete">
					{{ i18n.ts.defaultScheduledNoteDelete }}
				</MkSwitch>
				<MkSwitch v-model="useTextAreaAutoSize">
					<template #caption>{{ i18n.ts.textAreaAutoResizeDescription }}</template>
					{{ i18n.ts.textAreaAutoResize }}
				</MkSwitch>
			</div>
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
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkContainer from '@/components/MkContainer.vue';
import MkDeleteScheduleEditor from '@/components/MkDeleteScheduleEditor.vue';
import { bottomItemDef } from '@/scripts/post-form.js';

const useTextAreaAutoSize = computed(defaultStore.makeGetterSetter('useTextAreaAutoSize'));
const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));
const defaultScheduledNoteDelete = computed(defaultStore.makeGetterSetter('defaultScheduledNoteDelete'));
const scheduledNoteDelete = ref({ deleteAt: null, deleteAfter: defaultStore.state.defaultScheduledNoteDeleteTime, isValid: true });

const items = ref(defaultStore.state.postFormActions.map(x => ({
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
	defaultStore.set('postFormActions', items.value.map(x => x.type));
}

async function reset_postform() {
	const result = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (result.canceled) return;

	items.value = defaultStore.def.postFormActions.default.map(x => ({
		id: Math.random().toString(),
		type: x,
	}));
}

watch(scheduledNoteDelete, () => {
	if (!scheduledNoteDelete.value.isValid) return;
	defaultStore.set('defaultScheduledNoteDeleteTime', scheduledNoteDelete.value.deleteAfter);
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
