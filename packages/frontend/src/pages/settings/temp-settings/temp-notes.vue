<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-pencil"></i></template>
	<template #label>{{ i18n.ts.displayOfNote }}</template>
	<div class="_gaps_m">
		<MkNote :note="noteMock" :mock="true"/>
		<div class="_gaps_m">
			<MkSwitch v-model="directRenote">
				<template #label>
					{{ i18n.ts.directRenote }}
				</template>
				<template #caption>{{ i18n.ts.directRenoteDescription }}</template>
			</MkSwitch>
			<MkSwitch v-model="hideReactionUsers">
				<template #caption>{{ i18n.ts.hideReactionUsersDescription }}</template>
				{{ i18n.ts.hideReactionUsers }}
			</MkSwitch>
			<MkSwitch v-model="enableReactionConfirm">
				<template #label>
					{{ i18n.ts.enableReactionConfirm }}
				</template>
				<template #caption>{{ i18n.ts.enableReactionConfirmDescription }}</template>
			</MkSwitch>
			<MkSwitch v-model="enableLikeConfirm">
				<template #label>
					{{ i18n.ts.enableLikeConfirm }}
				</template>
				<template #caption>{{ i18n.ts.enableLikeConfirmDescription }}</template>
			</MkSwitch>
			<MkSwitch v-model="showInstanceTickerSoftwareName">
				<template #label>
					{{ i18n.ts.showInstanceTickerSoftwareName }}
				</template>
				<template #caption>{{ i18n.ts.showInstanceTickerSoftwareNameDescription }}</template>
			</MkSwitch>
			<MkSwitch v-model="showInstanceTickerVersion">
				<template #label>
					{{ i18n.ts.showInstanceTickerVersion }}
				</template>
				<template #caption>{{ i18n.ts.showInstanceTickerVersionDescription }}</template>
			</MkSwitch>
			<MkSwitch v-model="disableNoteNyaize">{{ i18n.ts.disableNoteNyaize }}</MkSwitch>
			<MkSelect v-model="hideReactionCount">
				<template #label>{{ i18n.ts.hideReactionCount }}</template>
				<option value="none">{{ i18n.ts._hideReactionCount.none }}</option>
				<option value="self">{{ i18n.ts._hideReactionCount.self }}</option>
				<option value="others">{{ i18n.ts._hideReactionCount.others }}</option>
				<option value="all">{{ i18n.ts._hideReactionCount.all }}</option>
			</MkSelect>
		</div>

		<MkFolder>
			<template #label>{{ i18n.ts.like }}</template>
			<div class="_gaps_m">
				<MkSwitch v-model="showLikeButton">{{ i18n.ts.showLikeButton }}</MkSwitch>

				<FromSlot v-model="selectReaction">
					<template #label>{{ i18n.ts.selectReaction }}</template>
					<MkCustomEmoji v-if="selectReaction && selectReaction.startsWith(':')" style="max-height: 3em; font-size: 1.1em;" :useOriginalSize="false" :name="selectReaction" :normal="true" :noStyle="true"/>
					<MkEmoji v-else-if="selectReaction && !selectReaction.startsWith(':')" :emoji="selectReaction" style="max-height: 3em; font-size: 1.1em;" :normal="true" :noStyle="true"/>
					<span v-else-if="!selectReaction">{{ i18n.ts.notSet }}</span>
					<div class="_buttons" style="padding-top: 8px;">
						<MkButton rounded :small="true" inline @click="chooseNewReaction"><i class="ti ti-mood-happy"></i> Change</MkButton>
						<MkButton rounded :small="true" inline @click="resetReaction"><i class="ti ti-reload"></i> Reset</MkButton>
					</div>
				</FromSlot>
			</div>
		</MkFolder>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import FromSlot from '@/components/form/slot.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkNote from '@/components/MkNote.vue';

const hideReactionUsers = computed(defaultStore.makeGetterSetter('hideReactionUsers'));
const hideReactionCount = computed(defaultStore.makeGetterSetter('hideReactionCount'));
const directRenote = computed(defaultStore.makeGetterSetter('directRenote'));
const disableNoteNyaize = computed(defaultStore.makeGetterSetter('disableNoteNyaize'));
const selectReaction = computed(defaultStore.makeGetterSetter('selectReaction'));
const showLikeButton = computed(defaultStore.makeGetterSetter('showLikeButton'));
const enableReactionConfirm = computed(defaultStore.makeGetterSetter('enableReactionConfirm'));
const enableLikeConfirm = computed(defaultStore.makeGetterSetter('enableLikeConfirm'));
const showInstanceTickerSoftwareName = computed(defaultStore.makeGetterSetter('showInstanceTickerSoftwareName'));
const showInstanceTickerVersion = computed(defaultStore.makeGetterSetter('showInstanceTickerVersion'));

function chooseNewReaction(ev: MouseEvent) {
	os.pickEmoji(getHTMLElement(ev), {
		showPinned: false,
	}).then(async (emoji) => {
		defaultStore.set('selectReaction', emoji as string);
	});
}

function resetReaction() {
	defaultStore.set('selectReaction', '');
}

function getHTMLElement(ev: MouseEvent): HTMLElement {
	const target = ev.currentTarget ?? ev.target;
	return target as HTMLElement;
}

const noteMock: Misskey.entities.Note = {
	id: '0000000000',
	createdAt: '2019-04-14T17:30:49.181Z',
	userId: '0000000001',
	user: {
		id: '0000000001',
		name: '藍',
		username: 'ai',
		host: 'example.ai',
		approved: true,
		avatarDecorations: [],
		avatarUrl: '/client-assets/tutorial/ai.webp',
		avatarBlurhash: 'eiKmhHIByXxZ~qWXs:-pR*NbR*s:xuRjoL-oR*WCt6WWf6WVf6oeWB',
		isBot: false,
		isCat: true,
		emojis: {},
		onlineStatus: 'online',
		badgeRoles: [],
		instance: {
			faviconUrl: 'favicon.ico',
			iconUrl: 'favicon.ico',
			name: 'example.ai',
			softwareName: 'Misskey',
			softwareVersion: '2025.1.0',
			themeColor: '#000000',
		},
	},
	text: 'テストメッセージです！な！',
	cw: null,
	visibility: 'public',
	localOnly: false,
	reactionAcceptance: null,
	renoteCount: 0,
	repliesCount: 1,
	reactionCount: 0,
	reactions: { '❤': 1 },
	reactionEmojis: {},
	fileIds: [],
	files: [],
	replyId: null,
	renoteId: null,
	dontShowOnLtl: false,
};
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
