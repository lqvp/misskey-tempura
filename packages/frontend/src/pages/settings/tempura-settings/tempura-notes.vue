<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-notes" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['notes', 'posts', 'content', 'display']">
	<MkFolder>
		<template #icon><i class="ti ti-pencil"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.displayOfNote }}</SearchLabel></template>
		<div class="_gaps_m">
			<MkNote :note="noteMock" :mock="true"/>
			<div class="_gaps_m">
				<SearchMarker :keywords="['direct', 'renote']">
					<MkPreferenceContainer k="directRenote">
						<MkSwitch v-model="directRenote">
							<template #label>
								<SearchLabel>{{ i18n.ts.directRenote }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.directRenoteDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['reaction', 'users', 'hide']">
					<MkPreferenceContainer k="hideReactionUsers">
						<MkSwitch v-model="hideReactionUsers">
							<template #label>
								<SearchLabel>{{ i18n.ts.hideReactionUsers }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.hideReactionUsersDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['reaction', 'confirm']">
					<MkPreferenceContainer k="enableReactionConfirm">
						<MkSwitch v-model="enableReactionConfirm">
							<template #label>
								<SearchLabel>{{ i18n.ts.enableReactionConfirm }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.enableReactionConfirmDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['like', 'confirm']">
					<MkPreferenceContainer k="enableLikeConfirm">
						<MkSwitch v-model="enableLikeConfirm">
							<template #label>
								<SearchLabel>{{ i18n.ts.enableLikeConfirm }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.enableLikeConfirmDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['instance', 'ticker', 'software', 'name']">
					<MkPreferenceContainer k="showInstanceTickerSoftwareName">
						<MkSwitch v-model="showInstanceTickerSoftwareName">
							<template #label>
								<SearchLabel>{{ i18n.ts.showInstanceTickerSoftwareName }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.showInstanceTickerSoftwareNameDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['instance', 'ticker', 'version']">
					<MkPreferenceContainer k="showInstanceTickerVersion">
						<MkSwitch v-model="showInstanceTickerVersion">
							<template #label>
								<SearchLabel>{{ i18n.ts.showInstanceTickerVersion }}</SearchLabel>
							</template>
							<template #caption>{{ i18n.ts.showInstanceTickerVersionDescription }}</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['note', 'nyaize', 'disable']">
					<MkPreferenceContainer k="disableNoteNyaize">
						<MkSwitch v-model="disableNoteNyaize">
							<template #label>
								<SearchLabel>{{ i18n.ts.disableNoteNyaize }}</SearchLabel>
							</template>
						</MkSwitch>
					</MkPreferenceContainer>
				</SearchMarker>

				<SearchMarker :keywords="['reaction', 'count', 'hide']">
					<MkPreferenceContainer k="hideReactionCount">
						<MkSelect v-model="hideReactionCount">
							<template #label><SearchLabel>{{ i18n.ts.hideReactionCount }}</SearchLabel></template>
							<option value="none">{{ i18n.ts._hideReactionCount.none }}</option>
							<option value="self">{{ i18n.ts._hideReactionCount.self }}</option>
							<option value="others">{{ i18n.ts._hideReactionCount.others }}</option>
							<option value="all">{{ i18n.ts._hideReactionCount.all }}</option>
						</MkSelect>
					</MkPreferenceContainer>
				</SearchMarker>

				<MkFolder>
					<template #label><SearchLabel>{{ i18n.ts.like }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['like', 'button', 'show']">
							<MkPreferenceContainer k="showLikeButton">
								<MkSwitch v-model="showLikeButton"><SearchLabel>{{ i18n.ts.showLikeButton }}</SearchLabel></MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['reaction', 'select']">
							<MkPreferenceContainer k="selectReaction">
								<FromSlot v-model="selectReaction">
									<template #label><SearchLabel>{{ i18n.ts.selectReaction }}</SearchLabel></template>
									<MkCustomEmoji v-if="selectReaction && selectReaction.startsWith(':')" style="max-height: 3em; font-size: 1.1em;" :useOriginalSize="false" :name="selectReaction" :normal="true" :noStyle="true"/>
									<MkEmoji v-else-if="selectReaction && !selectReaction.startsWith(':')" :emoji="selectReaction" style="max-height: 3em; font-size: 1.1em;" :normal="true" :noStyle="true"/>
									<span v-else>{{ i18n.ts.notSet }}</span>
									<div class="_buttons" style="padding-top: 8px;">
										<MkButton rounded :small="true" inline @click="chooseNewReaction"><i class="ti ti-mood-happy"></i> Change</MkButton>
										<MkButton rounded :small="true" inline @click="resetReaction"><i class="ti ti-reload"></i> Reset</MkButton>
									</div>
								</FromSlot>
							</MkPreferenceContainer>
						</SearchMarker>
					</div>
				</MkFolder>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import FromSlot from '@/components/form/slot.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkNote from '@/components/MkNote.vue';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import SearchLabel from '@/components/global/SearchLabel.vue';

const hideReactionUsers = prefer.model('hideReactionUsers');
const hideReactionCount = prefer.model('hideReactionCount');
const directRenote = prefer.model('directRenote');
const disableNoteNyaize = prefer.model('disableNoteNyaize');
const selectReaction = prefer.model('selectReaction');
const showLikeButton = prefer.model('showLikeButton');
const enableReactionConfirm = prefer.model('enableReactionConfirm');
const enableLikeConfirm = prefer.model('enableLikeConfirm');
const showInstanceTickerSoftwareName = prefer.model('showInstanceTickerSoftwareName');
const showInstanceTickerVersion = prefer.model('showInstanceTickerVersion');

function chooseNewReaction(ev: MouseEvent) {
	os.pickEmoji(getHTMLElement(ev), {
		showPinned: false,
	}).then(async (emoji) => {
		prefer.commit('selectReaction', emoji as string);
	});
}

function resetReaction() {
	prefer.commit('selectReaction', '');
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
	deliveryTargets: undefined,
};
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
