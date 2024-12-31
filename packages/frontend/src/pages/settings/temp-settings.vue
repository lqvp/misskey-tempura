<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<FormSection>
		<template #label>{{ i18n.ts._uniqueFeatures.uniqueFeature }}</template>

		<div class="_gaps_m">
			<MkFolder>
				<template #icon><i class="ti ti-lock-open"></i></template>
				<template #label>{{ i18n.ts.privacy }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_s">
					<MkSwitch v-if="!isLocked" v-model="autoRejectFollowRequest" @update:modelValue="save_privacy()">
						{{ i18n.ts.autoRejectFollowRequest }}<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						<template #caption>{{ i18n.ts.autoRejectFollowRequestDescription }}</template>
					</MkSwitch>
					<MkSwitch v-if="!isLocked" v-model="carefulBot" @update:modelValue="save_privacy()">{{ i18n.ts.carefulBot }}<template #caption>{{ i18n.ts.carefulBotDescription }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template></MkSwitch>

					<MkSwitch v-model="hideActivity" @update:modelValue="save_privacy()">
						{{ i18n.ts.hideActivity }}<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						<template #caption>{{ i18n.ts.hideActivityDescription }}</template>
					</MkSwitch>

					<MkSelect v-model="notesVisibility" @update:modelValue="save_privacy()">
						<template #label>{{ i18n.ts.notesVisibility }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<option value="public">{{ i18n.ts._ffVisibility.public }}</option>
						<option value="followers">{{ i18n.ts._ffVisibility.followers }}</option>
						<option value="private">{{ i18n.ts._ffVisibility.private }}</option>
					</MkSelect>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-pencil"></i></template>
				<template #label>{{ i18n.ts.displayOfNote }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<div class="_gaps_s">
						<MkSwitch v-model="directRenote">
							<template #label>
								{{ i18n.ts.directRenote }}
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts.directRenoteDescription }}</template>
						</MkSwitch>
						<MkSwitch v-model="hideReactionUsers">
							<template #caption>{{ i18n.ts.hideReactionUsersDescription }}</template>
							{{ i18n.ts.hideReactionUsers }}
							<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						</MkSwitch>
						<MkSwitch v-model="enableReactionConfirm">
							<template #label>
								{{ i18n.ts.enableReactionConfirm }}
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts.enableReactionConfirmDescription }}</template>
						</MkSwitch>
						<MkSwitch v-model="enableLikeConfirm">
							<template #label>
								{{ i18n.ts.enableLikeConfirm }}
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts.enableLikeConfirmDescription }}</template>
						</MkSwitch>
						<MkSwitch v-model="showInstanceTickerSoftwareName">
							<template #label>
								{{ i18n.ts.showInstanceTickerSoftwareName }}
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts.showInstanceTickerSoftwareNameDescription }}</template>
						</MkSwitch>
						<MkSwitch v-model="disableNoteNyaize">{{ i18n.ts.disableNoteNyaize }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>
						<MkSelect v-model="hideReactionCount">
							<template #label>{{ i18n.ts.hideReactionCount }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
							<option value="none">{{ i18n.ts._hideReactionCount.none }}</option>
							<option value="self">{{ i18n.ts._hideReactionCount.self }}</option>
							<option value="others">{{ i18n.ts._hideReactionCount.others }}</option>
							<option value="all">{{ i18n.ts._hideReactionCount.all }}</option>
						</MkSelect>
					</div>

					<MkFolder>
						<template #label>{{ i18n.ts.like }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<div class="_gaps_m">
							<MkSwitch v-model="showLikeButton">{{ i18n.ts.showLikeButton }}</MkSwitch>

							<FromSlot v-model="selectReaction">
								<template #label>{{ i18n.ts.selectReaction }}</template>
								<MkCustomEmoji v-if="selectReaction && selectReaction.startsWith(':')" style="max-height: 3em; font-size: 1.1em;" :useOriginalSize="false" :name="selectReaction" :normal="true" :noStyle="true"/>
								<MkEmoji v-else-if="selectReaction && !selectReaction.startsWith(':')" :emoji="selectReaction" style="max-height: 3em; font-size: 1.1em;" :normal="true" :noStyle="true"/>
								<span v-else-if="!selectReaction">{{ i18n.ts.notSet }}</span>
								<div class="_buttons" style="padding-top: 8px;">
									<MkButton rounded :small="true" inline @click="chooseNewReaction"><i class="ph-smiley ph-bold ph-lg"></i> Change</MkButton>
									<MkButton rounded :small="true" inline @click="resetReaction"><i class="ph-arrow-clockwise ph-bold ph-lg"></i> Reset</MkButton>
								</div>
							</FromSlot>
						</div>
					</MkFolder>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-letter-case"></i></template>
				<template #label>{{ i18n.ts.appearance }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<MkSelect v-model="customFont">
						<template #label>{{ i18n.ts.customFont }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<option :value="null">{{ i18n.ts.default }}</option>
						<option v-for="[name, font] of Object.entries(fontList)" :value="name">{{ font.name }}</option>
					</MkSelect>
					<MkSwitch v-model="enableSnowMode">{{ i18n.ts.snowMode }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-mood-happy"></i></template>
				<template #label>{{ i18n.ts.behavior }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<div class="_gaps_s">
						<MkSwitch v-model="reactionChecksMuting">
							{{ i18n.ts._reactionChecksMuting.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
						</MkSwitch>
					</div>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-cloud"></i></template>
				<template #label>{{ i18n.ts.drive }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<div class="_gaps_s">
						<MkSelect v-model="imageCompressionMode">
							<template #label>{{ i18n.ts._imageCompressionMode.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
							<option value="resizeCompress">{{ i18n.ts._imageCompressionMode.resizeCompress }}</option>
							<option value="noResizeCompress">{{ i18n.ts._imageCompressionMode.noResizeCompress }}</option>
							<option value="resizeCompressLossy">{{ i18n.ts._imageCompressionMode.resizeCompressLossy }}</option>
							<option value="noResizeCompressLossy">{{ i18n.ts._imageCompressionMode.noResizeCompressLossy }}</option>
							<template #caption>{{ i18n.ts._imageCompressionMode.description }}</template>
						</MkSelect>
					</div>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-user-scan"></i></template>
				<template #label>{{ i18n.ts._uniqueFeatures.hiddenProfile }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<div class="_buttons">
						<MkButton inline @click="enableAllHidden">{{ i18n.ts.enableAll }}</MkButton>
						<MkButton inline @click="disableAllHidden">{{ i18n.ts.disableAll }}</MkButton>
					</div>
					<MkSwitch v-model="hiddenPinnedNotes">
						<template #caption>{{ i18n.ts._uniqueFeatures.hiddenPinnedNotesDescription }}</template>
						{{ i18n.ts._uniqueFeatures.hiddenPinnedNotes }}
					</MkSwitch>
					<MkSwitch v-model="hiddenActivity">
						<template #caption>{{ i18n.ts._uniqueFeatures.hiddenActivityDescription }}</template>
						{{ i18n.ts._uniqueFeatures.hiddenActivity }}
					</MkSwitch>
					<MkSwitch v-model="hiddenFiles">
						<template #caption>{{ i18n.ts._uniqueFeatures.hiddenFilesDescription }}</template>
						{{ i18n.ts._uniqueFeatures.hiddenFiles }}
					</MkSwitch>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-forms"></i></template>
				<template #label>{{ i18n.ts.postForm }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_s">
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
					<MkSwitch v-model="disableNoteDrafting">
						<template #caption>{{ i18n.ts.disableNoteDraftingDescription }}</template>
						{{ i18n.ts.disableNoteDrafting }}
						<span class="_beta">{{ i18n.ts.originalFeature }}</span>
					</MkSwitch>
					<MkSelect v-model="draftSavingBehavior">
						<template #label>{{ i18n.ts.draftSavingBehavior }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<option value="auto">{{ i18n.ts._draftSavingBehavior.auto }}</option>
						<option value="manual">{{ i18n.ts._draftSavingBehavior.manual }}</option>
					</MkSelect>
					<div>
						<div :class="$style.label">
							{{ i18n.ts.defaultScheduledNoteDeleteTime }}
							<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						</div>
						<MkDeleteScheduleEditor v-model="scheduledNoteDelete" :afterOnly="true"/>
					</div>
					<MkSwitch v-model="defaultScheduledNoteDelete">
						{{ i18n.ts.defaultScheduledNoteDelete }}
						<span class="_beta">{{ i18n.ts.originalFeature }}</span>
					</MkSwitch>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-timeline"></i></template>
				<template #label>{{ i18n.ts.__TL_conf.hideTimelineLabel }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<div class="_gaps_m">
					<div class="_buttons">
						<MkButton inline @click="toggleAllHidden(true)">{{ i18n.ts.enableAll }}</MkButton>
						<MkButton inline @click="toggleAllHidden(false)">{{ i18n.ts.disableAll }}</MkButton>
					</div>
					<MkSwitch v-model="hideLocalTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideLocalTimeLineDescription }}</template>
						{{ i18n.ts.__TL_conf.hideLocalTimeLine }}
					</MkSwitch>
					<MkSwitch v-model="hideSocialTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideSocialTimeLineDescription }}</template>
						{{ i18n.ts.__TL_conf.hideSocialTimeLine }}
					</MkSwitch>
					<MkSwitch v-model="hideGlobalTimeLine">
						<template #caption>{{ i18n.ts.__TL_conf.hideGlobalTimeLineDescription }}</template>
						{{ i18n.ts.__TL_conf.hideGlobalTimeLine }}
					</MkSwitch>
					<MkSwitch v-model="hideFollowingsUpdates">
						<template #caption>{{ i18n.ts.__TL_conf.hideFollowingsUpdatesDescription }}</template>
						{{ i18n.ts.__TL_conf.hideFollowingsUpdates }}
					</MkSwitch>
					<MkSwitch v-model="hideFollowFeed">
						<template #caption>{{ i18n.ts.__TL_conf.hideFollowFeedDescription }}</template>
						{{ i18n.ts.__TL_conf.hideFollowFeed }}
					</MkSwitch>
					<MkSwitch v-model="hideLists">
						<template #caption>{{ i18n.ts.__TL_conf.hideListsDescription }}</template>
						{{ i18n.ts.__TL_conf.hideLists }}
					</MkSwitch>
					<MkSwitch v-model="hideAntennas">
						<template #caption>{{ i18n.ts.__TL_conf.hideAntennasDescription }}</template>
						{{ i18n.ts.__TL_conf.hideAntennas }}
					</MkSwitch>
					<MkSwitch v-model="hideChannel">
						<template #caption>{{ i18n.ts.__TL_conf.hideChannelDescription }}</template>
						{{ i18n.ts.__TL_conf.hideChannel }}
					</MkSwitch>
				</div>
			</MkFolder>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { defineAsyncComponent, ref } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
// import MkRadios from '@/components/MkRadios.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
// import FormLink from '@/components/form/link.vue';
import FromSlot from '@/components/form/slot.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { fontList } from '@/scripts/font';
import MkContainer from '@/components/MkContainer.vue';
import MkDeleteScheduleEditor from '@/components/MkDeleteScheduleEditor.vue';
import { bottomItemDef } from '@/scripts/post-form.js';
import { signinRequired } from '@/account.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

const $i = signinRequired();

const hideReactionUsers = computed(defaultStore.makeGetterSetter('hideReactionUsers'));
const hideReactionCount = computed(defaultStore.makeGetterSetter('hideReactionCount'));
const directRenote = computed(defaultStore.makeGetterSetter('directRenote'));
const showReactionsCount = computed(defaultStore.makeGetterSetter('showReactionsCount'));
const customFont = computed(defaultStore.makeGetterSetter('customFont'));
const hiddenPinnedNotes = computed(defaultStore.makeGetterSetter('hiddenPinnedNotes'));
const hiddenActivity = computed(defaultStore.makeGetterSetter('hiddenActivity'));
const hiddenFiles = computed(defaultStore.makeGetterSetter('hiddenFiles'));
const disableNoteNyaize = computed(defaultStore.makeGetterSetter('disableNoteNyaize'));
const reactionChecksMuting = computed(defaultStore.makeGetterSetter('reactionChecksMuting'));
const hideLocalTimeLine = computed(defaultStore.makeGetterSetter('hideLocalTimeLine'));
const hideGlobalTimeLine = computed(defaultStore.makeGetterSetter('hideGlobalTimeLine'));
const hideSocialTimeLine = computed(defaultStore.makeGetterSetter('hideSocialTimeLine'));
const hideFollowingsUpdates = computed(defaultStore.makeGetterSetter('hideFollowingsUpdates'));
const hideFollowFeed = computed(defaultStore.makeGetterSetter('hideFollowFeed'));
const hideLists = computed(defaultStore.makeGetterSetter('hideLists'));
const hideAntennas = computed(defaultStore.makeGetterSetter('hideAntennas'));
const hideChannel = computed(defaultStore.makeGetterSetter('hideChannel'));
const selectReaction = computed(defaultStore.makeGetterSetter('selectReaction'));
const showLikeButton = computed(defaultStore.makeGetterSetter('showLikeButton'));
const disableNoteDrafting = computed(defaultStore.makeGetterSetter('disableNoteDrafting'));
const imageCompressionMode = computed(defaultStore.makeGetterSetter('imageCompressionMode'));
const enableSnowMode = computed(defaultStore.makeGetterSetter('enableSnowMode'));
const enableReactionConfirm = computed(defaultStore.makeGetterSetter('enableReactionConfirm'));
const enableLikeConfirm = computed(defaultStore.makeGetterSetter('enableLikeConfirm'));
const showInstanceTickerSoftwareName = computed(defaultStore.makeGetterSetter('showInstanceTickerSoftwareName'));

const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));
const draftSavingBehavior = computed(defaultStore.makeGetterSetter('draftSavingBehavior'));
const defaultScheduledNoteDelete = computed(defaultStore.makeGetterSetter('defaultScheduledNoteDelete'));
const scheduledNoteDelete = ref({ deleteAt: null, deleteAfter: defaultStore.state.defaultScheduledNoteDeleteTime, isValid: true });

const autoRejectFollowRequest = ref($i.autoRejectFollowRequest);
const carefulBot = ref($i.carefulBot);
const hideActivity = ref($i.hideActivity);
const notesVisibility = ref($i.notesVisibility);

const items = ref(defaultStore.state.postFormActions.map(x => ({
	id: Math.random().toString(),
	type: x,
})));

watch([
	hideReactionUsers,
	hideReactionCount,
	directRenote,
	showReactionsCount,
	customFont,
	hiddenPinnedNotes,
	hiddenActivity,
	hiddenFiles,
	disableNoteNyaize,
	reactionChecksMuting,
	hideLocalTimeLine,
	hideGlobalTimeLine,
	hideSocialTimeLine,
	hideFollowingsUpdates,
	hideFollowFeed,
	hideLists,
	hideAntennas,
	hideChannel,
	selectReaction,
	showLikeButton,
	disableNoteDrafting,
	enableSnowMode,
	enableReactionConfirm,
	enableLikeConfirm,
], async () => {
	await reloadAsk({ reason: i18n.ts.reloadToApplySetting, unison: true });
});

function chooseNewReaction(ev: MouseEvent) {
	os.pickEmoji(getHTMLElement(ev), {
		showPinned: false,
	}).then(async (emoji) => {
		selectReaction.value = emoji as string;
		await reloadAsk();
	});
}

function resetReaction() {
	selectReaction.value = '';
	reloadAsk();
}

function getHTMLElement(ev: MouseEvent): HTMLElement {
	const target = ev.currentTarget ?? ev.target;
	return target as HTMLElement;
}

function enableAllHidden() {
	defaultStore.set('hiddenPinnedNotes', true);
	defaultStore.set('hiddenActivity', true);
	defaultStore.set('hiddenFiles', true);
}

function disableAllHidden() {
	defaultStore.set('hiddenPinnedNotes', false);
	defaultStore.set('hiddenActivity', false);
	defaultStore.set('hiddenFiles', false);
}

function toggleAllHidden(value: boolean) {
	const settings = [
		'hideLocalTimeLine',
		'hideGlobalTimeLine',
		'hideSocialTimeLine',
		'hideFollowingsUpdates',
		'hideFollowFeed',
		'hideLists',
		'hideAntennas',
		'hideChannel',
	];

	settings.forEach(setting => {
		defaultStore.set(setting, value);
	});
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

function save_privacy() {
	misskeyApi('i/update', {
		autoRejectFollowRequest: !!autoRejectFollowRequest.value,
		carefulBot: !!carefulBot.value,
		hideActivity: !!hideActivity.value,
		notesVisibility: notesVisibility.value,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: 'temp-fork',
	icon: 'ti ti-adjustments',
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

