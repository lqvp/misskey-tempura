/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { v4 as uuid } from 'uuid';
import type { DeckProfile } from '@/deck.js';
import { ColdDeviceStorage, store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { deckStore } from '@/ui/deck/deck-store.js';
import { unisonReload } from '@/utility/unison-reload.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

// TODO: そのうち消す
export function migrateOldSettings() {
	os.waiting(i18n.ts.settingsMigrating);

	store.loaded.then(async () => {
		misskeyApi('i/registry/get', { scope: ['client'], key: 'themes' }).catch(() => []).then((themes: any) => {
			if (themes.length > 0) {
				prefer.commit('themes', themes);
			}
		});

		const plugins = ColdDeviceStorage.get('plugins');
		prefer.commit('plugins', plugins.map(p => ({
			...p,
			installId: (p as any).id,
			id: undefined,
		})));

		prefer.commit('deck.profile', deckStore.s.profile);
		misskeyApi('i/registry/keys', {
			scope: ['client', 'deck', 'profiles'],
		}).then(async keys => {
			const profiles: DeckProfile[] = [];
			for (const key of keys) {
				const deck = await misskeyApi('i/registry/get', {
					scope: ['client', 'deck', 'profiles'],
					key: key,
				});
				profiles.push({
					id: uuid(),
					name: key,
					columns: deck.columns,
					layout: deck.layout,
				});
			}
			prefer.commit('deck.profiles', profiles);
		});

		prefer.commit('lightTheme', ColdDeviceStorage.get('lightTheme'));
		prefer.commit('darkTheme', ColdDeviceStorage.get('darkTheme'));
		prefer.commit('syncDeviceDarkMode', ColdDeviceStorage.get('syncDeviceDarkMode'));
		prefer.commit('emojiPalettes', [{
			id: 'reactions',
			name: '',
			emojis: store.s.reactions,
		}, {
			id: 'pinnedEmojis',
			name: '',
			emojis: store.s.pinnedEmojis,
		}]);
		prefer.commit('emojiPaletteForMain', 'pinnedEmojis');
		prefer.commit('emojiPaletteForReaction', 'reactions');
		prefer.commit('overridedDeviceKind', store.s.overridedDeviceKind);
		prefer.commit('widgets', store.s.widgets);
		prefer.commit('keepCw', store.s.keepCw);
		prefer.commit('collapseRenotes', store.s.collapseRenotes);
		prefer.commit('rememberNoteVisibility', store.s.rememberNoteVisibility);
		prefer.commit('uploadFolder', store.s.uploadFolder);
		prefer.commit('menu', [...store.s.menu, 'chat']);
		prefer.commit('statusbars', store.s.statusbars);
		prefer.commit('pinnedUserLists', store.s.pinnedUserLists);
		prefer.commit('serverDisconnectedBehavior', store.s.serverDisconnectedBehavior);
		prefer.commit('nsfw', store.s.nsfw);
		prefer.commit('highlightSensitiveMedia', store.s.highlightSensitiveMedia);
		prefer.commit('animation', store.s.animation);
		prefer.commit('animatedMfm', store.s.animatedMfm);
		prefer.commit('advancedMfm', store.s.advancedMfm);
		prefer.commit('showReactionsCount', store.s.showReactionsCount);
		prefer.commit('enableQuickAddMfmFunction', store.s.enableQuickAddMfmFunction);
		prefer.commit('loadRawImages', store.s.loadRawImages);
		prefer.commit('imageNewTab', store.s.imageNewTab);
		prefer.commit('disableShowingAnimatedImages', store.s.disableShowingAnimatedImages);
		prefer.commit('emojiStyle', store.s.emojiStyle);
		prefer.commit('menuStyle', store.s.menuStyle);
		prefer.commit('useBlurEffectForModal', store.s.useBlurEffectForModal);
		prefer.commit('useBlurEffect', store.s.useBlurEffect);
		prefer.commit('showFixedPostForm', store.s.showFixedPostForm);
		prefer.commit('showFixedPostFormInChannel', store.s.showFixedPostFormInChannel);
		prefer.commit('enableInfiniteScroll', store.s.enableInfiniteScroll);
		prefer.commit('useReactionPickerForContextMenu', store.s.useReactionPickerForContextMenu);
		prefer.commit('instanceTicker', store.s.instanceTicker);
		prefer.commit('emojiPickerScale', store.s.emojiPickerScale);
		prefer.commit('emojiPickerWidth', store.s.emojiPickerWidth);
		prefer.commit('emojiPickerHeight', store.s.emojiPickerHeight);
		prefer.commit('emojiPickerStyle', store.s.emojiPickerStyle);
		prefer.commit('reportError', store.s.reportError);
		prefer.commit('squareAvatars', store.s.squareAvatars);
		prefer.commit('showAvatarDecorations', store.s.showAvatarDecorations);
		prefer.commit('numberOfPageCache', store.s.numberOfPageCache);
		prefer.commit('showNoteActionsOnlyHover', store.s.showNoteActionsOnlyHover);
		prefer.commit('showClipButtonInNoteFooter', store.s.showClipButtonInNoteFooter);
		prefer.commit('reactionsDisplaySize', store.s.reactionsDisplaySize);
		prefer.commit('limitWidthOfReaction', store.s.limitWidthOfReaction);
		prefer.commit('forceShowAds', store.s.forceShowAds);
		prefer.commit('aiChanMode', store.s.aiChanMode);
		prefer.commit('devMode', store.s.devMode);
		prefer.commit('mediaListWithOneImageAppearance', store.s.mediaListWithOneImageAppearance);
		prefer.commit('notificationPosition', store.s.notificationPosition);
		prefer.commit('notificationStackAxis', store.s.notificationStackAxis);
		prefer.commit('enableCondensedLine', store.s.enableCondensedLine);
		prefer.commit('keepScreenOn', store.s.keepScreenOn);
		prefer.commit('useGroupedNotifications', store.s.useGroupedNotifications);
		prefer.commit('dataSaver', store.s.dataSaver);
		prefer.commit('enableSeasonalScreenEffect', store.s.enableSeasonalScreenEffect);
		prefer.commit('enableHorizontalSwipe', store.s.enableHorizontalSwipe);
		prefer.commit('useNativeUiForVideoAudioPlayer', store.s.useNativeUIForVideoAudioPlayer);
		prefer.commit('keepOriginalFilename', store.s.keepOriginalFilename);
		prefer.commit('alwaysConfirmFollow', store.s.alwaysConfirmFollow);
		prefer.commit('confirmWhenRevealingSensitiveMedia', store.s.confirmWhenRevealingSensitiveMedia);
		prefer.commit('contextMenu', store.s.contextMenu);
		prefer.commit('skipNoteRender', store.s.skipNoteRender);
		prefer.commit('showSoftWordMutedWord', store.s.showSoftWordMutedWord);
		prefer.commit('confirmOnReact', store.s.confirmOnReact);
		prefer.commit('defaultFollowWithReplies', store.s.defaultWithReplies);
		prefer.commit('sound.masterVolume', store.s.sound_masterVolume);
		prefer.commit('sound.notUseSound', store.s.sound_notUseSound);
		prefer.commit('sound.useSoundOnlyWhenActive', store.s.sound_useSoundOnlyWhenActive);
		prefer.commit('sound.on.note', store.s.sound_note as any);
		prefer.commit('sound.on.noteMy', store.s.sound_noteMy as any);
		prefer.commit('sound.on.notification', store.s.sound_notification as any);
		prefer.commit('sound.on.reaction', store.s.sound_reaction as any);
		prefer.commit('defaultNoteVisibility', store.s.defaultNoteVisibility);
		prefer.commit('defaultNoteLocalOnly', store.s.defaultNoteLocalOnly);

		// region 独自周り
		prefer.commit('postFormActions', store.s.postFormActions);
		prefer.commit('defaultScheduledNoteDelete', store.s.defaultScheduledNoteDelete);
		prefer.commit('defaultScheduledNoteDeleteTime', store.s.defaultScheduledNoteDeleteTime);
		prefer.commit('selectReaction', store.s.selectReaction);
		prefer.commit('showLikeButton', store.s.showLikeButton);
		prefer.commit('hideReactionUsers', store.s.hideReactionUsers);
		prefer.commit('hideReactionCount', store.s.hideReactionCount);
		prefer.commit('customFont', store.s.customFont);
		prefer.commit('disableNoteNyaize', store.s.disableNoteNyaize);
		prefer.commit('hideLocalTimeLine', store.s.hideLocalTimeLine);
		prefer.commit('hideSocialTimeLine', store.s.hideSocialTimeLine);
		prefer.commit('hideGlobalTimeLine', store.s.hideGlobalTimeLine);
		prefer.commit('hideLists', store.s.hideLists);
		prefer.commit('hideAntennas', store.s.hideAntennas);
		prefer.commit('hideChannel', store.s.hideChannel);
		prefer.commit('nicknameEnabled', store.s.nicknameEnabled);
		prefer.commit('nicknameMap', store.s.nicknameMap);
		prefer.commit('directRenote', store.s.directRenote);
		prefer.commit('reactionChecksMuting', store.s.reactionChecksMuting);
		prefer.commit('imageCompressionMode', store.s.imageCompressionMode);
		prefer.commit('anonymizeMutedUsers', store.s.anonymizeMutedUsers);
		prefer.commit('enableReactionConfirm', store.s.enableReactionConfirm);
		prefer.commit('enableLikeConfirm', store.s.enableLikeConfirm);
		prefer.commit('showInstanceTickerSoftwareName', store.s.showInstanceTickerSoftwareName);
		prefer.commit('showInstanceTickerVersion', store.s.showInstanceTickerVersion);
		prefer.commit('useTextAreaAutoSize', store.s.useTextAreaAutoSize);
		prefer.commit('specifiedUsers', store.s.specifiedUsers);
		prefer.commit('useGeminiLLMAPI', store.s.useGeminiLLMAPI);
		prefer.commit('useGeminiWithMedia', store.s.useGeminiWithMedia);
		prefer.commit('geminiToken', store.s.geminiToken);
		prefer.commit('geminiModels', store.s.geminiModels);
		prefer.commit('geminiSystemPrompt', store.s.geminiSystemPrompt);
		prefer.commit('geminiPromptNote', store.s.geminiPromptNote);
		prefer.commit('geminiPromptProfile', store.s.geminiPromptProfile);
		prefer.commit('geminiNoteLongText', store.s.geminiNoteLongText);
		prefer.commit('geminiNoteShortText', store.s.geminiNoteShortText);
		prefer.commit('geminiNoteSimpleText', store.s.geminiNoteSimpleText);
		prefer.commit('geminiNoteCasualText', store.s.geminiNoteCasualText);
		prefer.commit('geminiNoteProfessionalText', store.s.geminiNoteProfessionalText);
		prefer.commit('geminiNoteCatText', store.s.geminiNoteCatText);
		prefer.commit('geminiNoteCustomText', store.s.geminiNoteCustomText);
		prefer.commit('enableEarthquakeWarning', store.s.enableEarthquakeWarning);
		prefer.commit('earthquakeWarningIntensity', store.s.earthquakeWarningIntensity);
		prefer.commit('enableEarthquakeWarningTts', store.s.enableEarthquakeWarningTts);
		prefer.commit('earthquakeWarningToastDuration', store.s.earthquakeWarningToastDuration);
		prefer.commit('earthquakeWarningTtsRate', store.s.earthquakeWarningTtsRate);
		prefer.commit('earthquakeWarningNotificationStyle', store.s.earthquakeWarningNotificationStyle);
		prefer.commit('earthquakeWarningSound', store.s.earthquakeWarningSound);
		prefer.commit('earthquakeWarningSoundType', store.s.earthquakeWarningSoundType);
		prefer.commit('earthquakeWarningRegionFilter', store.s.earthquakeWarningRegionFilter);
		prefer.commit('enableEarthquakeWarningRegionFilter', store.s.enableEarthquakeWarningRegionFilter);
		prefer.commit('earthquakeWarningThrottleTime', store.s.earthquakeWarningThrottleTime);
		prefer.commit('earthquakeWarningIgnoreTraining', store.s.earthquakeWarningIgnoreTraining);
		prefer.commit('earthquakeWarningConnectionNotify', store.s.earthquakeWarningConnectionNotify);
		prefer.commit('earthquakeWarningLogLevel', store.s.earthquakeWarningLogLevel);
		// endregion

		window.setTimeout(() => {
			unisonReload();
		}, 10000);
	});
}
