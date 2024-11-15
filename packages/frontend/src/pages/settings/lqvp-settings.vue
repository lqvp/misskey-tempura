<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<FormSection>
		<div class="_gaps_s">
			<MkSwitch v-model="disableNoteDrafting">
				<template #caption>{{ i18n.ts.disableNoteDraftingDescription }}</template>
				{{ i18n.ts.disableNoteDrafting }}
				<span class="_beta">{{ i18n.ts.originalFeature }}</span>
			</MkSwitch>
			<FormLink to="/settings/post-form">{{ i18n.ts.postForm }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></FormLink>
		</div>
	</FormSection>
	<FormSection>
		<template #label>{{ i18n.ts.displayOfNote }}</template>

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
				<MkSelect v-model="hideReactionCount">
					<template #label>{{ i18n.ts.hideReactionCount }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<option value="none">{{ i18n.ts._hideReactionCount.none }}</option>
					<option value="self">{{ i18n.ts._hideReactionCount.self }}</option>
					<option value="others">{{ i18n.ts._hideReactionCount.others }}</option>
					<option value="all">{{ i18n.ts._hideReactionCount.all }}</option>
				</MkSelect>
			</div>

			<MkSwitch v-if="instanceTicker !== 'none'" v-model="instanceIcon">{{ i18n.ts.instanceIcon }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>

			<MkSwitch v-model="disableNoteNyaize">{{ i18n.ts.disableNoteNyaize }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></MkSwitch>

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
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts.appearance }}</template>

		<div class="_gaps_m">
			<MkSelect v-model="customFont">
				<template #label>{{ i18n.ts.customFont }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
				<option :value="null">{{ i18n.ts.default }}</option>
				<option v-for="[name, font] of Object.entries(fontList)" :value="name">{{ font.name }}</option>
			</MkSelect>
		</div>
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts.behavior }}</template>

		<div class="_gaps_m">
			<div class="_gaps_s">
				<MkSwitch v-model="reactionChecksMuting">
					{{ i18n.ts._reactionChecksMuting.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span>
					<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
				</MkSwitch>
			</div>
		</div>
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts._uniqueFeatures.uniqueFeature }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

		<div class="_gaps_m">
			<MkFolder>
				<template #label>{{ i18n.ts._uniqueFeatures.hiddenProfile }}</template>
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
		</div>
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts.__TL_conf.extendSettings }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

		<div class="_gaps_m">
			<MkFolder>
				<template #label>{{ i18n.ts.__TL_conf.hideTimelineLabel }}</template>
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

	<FormSection>
		<template #label>{{ i18n.ts.drive }}</template>

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
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import FormLink from '@/components/form/link.vue';
import FromSlot from '@/components/form/slot.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { fontList } from '@/scripts/font';

const hideReactionUsers = computed(defaultStore.makeGetterSetter('hideReactionUsers'));
const hideReactionCount = computed(defaultStore.makeGetterSetter('hideReactionCount'));
const directRenote = computed(defaultStore.makeGetterSetter('directRenote'));
const showReactionsCount = computed(defaultStore.makeGetterSetter('showReactionsCount'));
const customFont = computed(defaultStore.makeGetterSetter('customFont'));
const hiddenPinnedNotes = computed(defaultStore.makeGetterSetter('hiddenPinnedNotes'));
const hiddenActivity = computed(defaultStore.makeGetterSetter('hiddenActivity'));
const hiddenFiles = computed(defaultStore.makeGetterSetter('hiddenFiles'));
const instanceIcon = computed(defaultStore.makeGetterSetter('instanceIcon'));
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

watch([
	hideReactionUsers,
	hideReactionCount,
	directRenote,
	showReactionsCount,
	customFont,
	hiddenPinnedNotes,
	hiddenActivity,
	hiddenFiles,
	instanceIcon,
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

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: 'lqvp-fork',
	icon: 'ti ti-adjustments',
}));
</script>

