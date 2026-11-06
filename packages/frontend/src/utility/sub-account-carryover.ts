/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PREF_DEF } from '@/preferences/def.js';
import type { store } from '@/store.js';

/**
 * How a setting is treated when a sub-account is created from the main account.
 * - copy: copied as is
 * - copy-after-probe: references to account-owned objects are checked as the sub-account; unusable ones are emptied
 * - never: not copied
 *
 * Every key must be listed. A key that is added later without a class fails type checking,
 * so nothing is copied by accident.
 */
export type CarryoverClass = 'copy' | 'copy-after-probe' | 'never';

export type CarryoverResult = {
	copied: string[];
	emptied: string[];
	skipped: string[];
};

export const PREF_CARRYOVER = {
	accounts: 'never', // account list holds other accounts
	pinnedUserLists: 'copy-after-probe', // list references
	uploadFolder: 'copy-after-probe', // drive folder reference
	widgets: 'copy-after-probe', // widgets can reference lists, antennas, channels and clips
	emojiPalettes: 'copy',
	emojiPaletteForReaction: 'copy',
	emojiPaletteForMain: 'copy',
	overridedDeviceKind: 'copy',
	themes: 'copy',
	lightTheme: 'copy',
	darkTheme: 'copy',
	syncDeviceDarkMode: 'copy',
	defaultNoteVisibility: 'copy',
	defaultNoteLocalOnly: 'copy',
	keepCw: 'copy',
	rememberNoteVisibility: 'copy',
	reportError: 'copy',
	collapseRenotes: 'copy',
	menu: 'copy-after-probe', // menu entries can point at lists, antennas, channels and clips
	statusbars: 'copy-after-probe', // status bars can reference lists, antennas and channels
	serverDisconnectedBehavior: 'copy',
	nsfw: 'copy',
	highlightSensitiveMedia: 'copy',
	animation: 'copy',
	animatedMfm: 'copy',
	advancedMfm: 'copy',
	showReactionsCount: 'copy',
	enableQuickAddMfmFunction: 'copy',
	loadRawImages: 'copy',
	imageNewTab: 'copy',
	disableShowingAnimatedImages: 'copy',
	emojiStyle: 'copy',
	menuStyle: 'copy',
	useBlurEffectForModal: 'copy',
	useBlurEffect: 'copy',
	useStickyIcons: 'copy',
	enableHighQualityImagePlaceholders: 'copy',
	showFixedPostForm: 'copy',
	showFixedPostFormInChannel: 'copy',
	enableInfiniteScroll: 'copy',
	useReactionPickerForContextMenu: 'copy',
	instanceTicker: 'copy',
	emojiPickerScale: 'copy',
	emojiPickerWidth: 'copy',
	emojiPickerHeight: 'copy',
	emojiPickerStyle: 'copy',
	squareAvatars: 'copy',
	showAvatarDecorations: 'copy',
	numberOfPageCache: 'copy',
	pollingInterval: 'copy',
	showNoteActionsOnlyHover: 'copy',
	showClipButtonInNoteFooter: 'copy',
	reactionsDisplaySize: 'copy',
	limitWidthOfReaction: 'copy',
	forceShowAds: 'copy',
	aiChanMode: 'copy',
	devMode: 'copy',
	mediaListWithOneImageAppearance: 'copy',
	showMediaListByGridInWideArea: 'copy',
	notificationPosition: 'copy',
	notificationStackAxis: 'copy',
	keepScreenOn: 'copy',
	useGroupedNotifications: 'copy',
	dataSaver: 'copy',
	hemisphere: 'copy',
	enableSeasonalScreenEffect: 'copy',
	enableHorizontalSwipe: 'copy',
	enablePullToRefresh: 'copy',
	useNativeUiForVideoAudioPlayer: 'copy',
	keepOriginalFilename: 'copy',
	alwaysConfirmFollow: 'copy',
	confirmWhenRevealingSensitiveMedia: 'copy',
	contextMenu: 'copy',
	skipNoteRender: 'copy',
	showSoftWordMutedWord: 'copy',
	confirmOnReact: 'copy',
	defaultFollowWithReplies: 'copy',
	makeEveryTextElementsSelectable: 'copy',
	showNavbarSubButtons: 'copy',
	showTitlebar: 'copy',
	showAvailableReactionsFirstInNote: 'copy',
	showPageTabBarBottom: 'copy',
	plugins: 'never', // plugin code and its config can hold secrets and run third-party code
	mutingEmojis: 'copy',
	watermarkPresets: 'never', // presets can hold drive file references of the main account
	defaultWatermarkPresetId: 'never', // points at a watermark preset that is not carried
	imageFramePresets: 'never', // presets can hold drive file references of the main account
	defaultImageCompressionLevel: 'copy',
	defaultVideoCompressionLevel: 'copy',
	postFormActions: 'copy',
	defaultScheduledNoteDelete: 'copy',
	defaultScheduledNoteDeleteTime: 'copy',
	selectReaction: 'copy',
	showLikeButton: 'copy',
	hideReactionUsers: 'copy',
	hideReactionCount: 'copy',
	customFont: 'copy',
	disableNoteNyaize: 'copy',
	hideLocalTimeLine: 'copy',
	hideSocialTimeLine: 'copy',
	hideGlobalTimeLine: 'copy',
	hideLists: 'copy',
	hideAntennas: 'copy',
	hideChannel: 'copy',
	nicknameEnabled: 'copy',
	nicknameMap: 'never', // maps other users of the main account to nicknames (personal data)
	directRenote: 'copy',
	reactionChecksMuting: 'copy',
	anonymizeMutedUsers: 'copy',
	enableReactionConfirm: 'copy',
	enableLikeConfirm: 'copy',
	showInstanceTickerSoftwareName: 'copy',
	showInstanceTickerVersion: 'copy',
	useTextAreaAutoSize: 'copy',
	specifiedUsers: 'never', // user references of the main account
	useGeminiLLMAPI: 'copy',
	useGeminiWithMedia: 'copy',
	geminiToken: 'never', // external API key
	geminiModel: 'copy',
	geminiSystemPrompt: 'copy',
	geminiPromptNote: 'copy',
	geminiPromptProfile: 'copy',
	geminiNoteLongText: 'copy',
	geminiNoteShortText: 'copy',
	geminiNoteSimpleText: 'copy',
	geminiNoteCasualText: 'copy',
	geminiNoteProfessionalText: 'copy',
	geminiNoteCatText: 'copy',
	geminiNoteCustomText: 'copy',
	geminiThinkingBudget: 'copy',
	enableEarthquakeWarning: 'copy',
	earthquakeWarningIntensity: 'copy',
	enableEarthquakeWarningTts: 'copy',
	earthquakeWarningTtsVoice: 'copy',
	earthquakeWarningToastDuration: 'copy',
	earthquakeWarningTtsRate: 'copy',
	earthquakeWarningNotificationStyle: 'copy',
	earthquakeWarningSound: 'copy',
	earthquakeWarningSoundType: 'copy',
	earthquakeWarningRegionFilter: 'copy',
	enableEarthquakeWarningRegionFilter: 'copy',
	earthquakeWarningThrottleTime: 'copy',
	earthquakeWarningIgnoreTraining: 'copy',
	earthquakeWarningConnectionNotify: 'copy',
	earthquakeWarningLogLevel: 'copy',
	earthquakeWarningReportNumber: 'copy',
	earthquakeWarningFinalOnly: 'copy',
	earthquakeWarningReportFilterMode: 'copy',
	useNoteVisibilityColoring: 'copy',
	noteVisibilityColorPublicNonLtl: 'copy',
	noteVisibilityColorHome: 'copy',
	noteVisibilityColorFollowers: 'copy',
	noteVisibilityColorSpecified: 'copy',
	noteVisibilityColorLocalOnly: 'copy',
	defaultFxTwitterEmbedProvider: 'copy',
	widgetDrawerDirection: 'copy',
	chooseFileFrom: 'copy',
	enableViewedRenotes: 'copy',
	viewedRenotes: 'never', // note references of the main account
	'deck.profile': 'copy',
	'deck.profiles': 'copy-after-probe', // deck columns can reference lists, antennas, channels and clips
	'sound.masterVolume': 'copy',
	'sound.notUseSound': 'copy',
	'sound.useSoundOnlyWhenActive': 'copy',
	'sound.on.note': 'copy',
	'sound.on.noteMy': 'copy',
	'sound.on.notification': 'copy',
	'sound.on.reaction': 'copy',
	'sound.on.chatMessage': 'copy',
	'deck.alwaysShowMainColumn': 'copy',
	'deck.navWindow': 'copy',
	'deck.useSimpleUiForNonRootPages': 'copy',
	'deck.columnAlign': 'copy',
	'deck.columnGap': 'copy',
	'deck.menuPosition': 'copy',
	'deck.navbarPosition': 'copy',
	'deck.wallpaper': 'never', // can reference a drive file of the main account
	'chat.showSenderName': 'copy',
	'chat.sendOnEnter': 'copy',
	'game.dropAndFusion': 'copy',
	'experimental.stackingRouterView': 'copy',
	'experimental.enableFolderPageView': 'copy',
	'experimental.enableHapticFeedback': 'copy',
	'experimental.enableWebTranslatorApi': 'copy',
} as const satisfies Record<keyof typeof PREF_DEF, CarryoverClass>;

// Account-scoped state held in the base store. Keys that live only on the device are not account data and are never copied.
export const STORE_CARRYOVER = {
	accountSetupWizard: 'copy',
	tips: 'never',
	defaultScheduledNoteDelete: 'copy',
	defaultScheduledNoteDeleteTime: 'copy',
	pastedFileName: 'copy',
	memo: 'never', // personal notes
	reactionAcceptance: 'copy',
	mutedAds: 'copy',
	postFormActions: 'copy',
	visibility: 'copy',
	localOnly: 'copy',
	showPreview: 'never',
	tl: 'copy',
	darkMode: 'never',
	realtimeMode: 'never',
	recentlyUsedEmojis: 'never',
	recentlyUsedUsers: 'never',
	menuDisplay: 'never',
	postFormWithHashtags: 'never',
	postFormHashtags: 'never',
	additionalUnicodeEmojiIndexes: 'never',
	pluginTokens: 'never', // plugin credentials
	accountTokens: 'never', // auth tokens
	accountInfos: 'never', // other accounts info
	enablePreferencesAutoCloudBackup: 'never',
	showPreferencesAutoCloudBackupSuggestion: 'never',
	showStoragePersistenceSuggestion: 'never',
	rememberNoteVisibility: 'copy',
	defaultNoteVisibility: 'copy',
	defaultNoteLocalOnly: 'copy',
	nicknameMap: 'never', // maps other users of the main account to nicknames (personal data)
	specifiedUsers: 'never', // user references of the main account
	geminiToken: 'never', // external API key
} as const satisfies Record<keyof typeof store.s, CarryoverClass>;

export type ProbeRef = { type: 'list' | 'antenna' | 'channel' | 'clip' | 'driveFolder'; id: string };

// property names that hold a reference to an object owned by an account
const REF_KEYS: Record<string, ProbeRef['type']> = {
	listId: 'list',
	userListId: 'list',
	antennaId: 'antenna',
	channelId: 'channel',
	clipId: 'clip',
	folderId: 'driveFolder',
};

const refKey = (r: ProbeRef) => `${r.type}:${r.id}`;

function refOfEntry(key: string, value: unknown): ProbeRef | null {
	const type = REF_KEYS[key];
	return type != null && typeof value === 'string' && value !== '' ? { type, id: value } : null;
}

/** Collect every account-owned reference in a value. `kind` tells how a bare value is to be read. */
export function collectReferences(key: string, value: unknown): ProbeRef[] {
	const out = new Map<string, ProbeRef>();
	const add = (r: ProbeRef | null) => { if (r) out.set(refKey(r), r); };
	if (key === 'uploadFolder' && typeof value === 'string') add({ type: 'driveFolder', id: value });
	if (key === 'pinnedUserLists' && Array.isArray(value)) {
		for (const l of value) if (l != null && typeof l === 'object' && typeof (l as { id?: unknown }).id === 'string') add({ type: 'list', id: (l as { id: string }).id });
	}
	const walk = (v: unknown) => {
		if (Array.isArray(v)) v.forEach(walk);
		else if (v != null && typeof v === 'object') {
			for (const [k, x] of Object.entries(v)) {
				add(refOfEntry(k, x));
				walk(x);
			}
		}
	};
	walk(value);
	return [...out.values()];
}

function holdsUnusable(v: unknown, usable: Set<string>): boolean {
	if (Array.isArray(v)) return v.some(x => holdsUnusable(x, usable));
	if (v != null && typeof v === 'object') {
		return Object.entries(v).some(([k, x]) => {
			const r = refOfEntry(k, x);
			return (r != null && !usable.has(refKey(r))) || holdsUnusable(x, usable);
		});
	}
	return false;
}

/**
 * Empty what the sub-account cannot use. A bare reference becomes null. An array element holding an unusable
 * reference is removed (the element of the nearest array, so a single widget goes, not the whole list);
 * deck profiles are removed whole because their layout refers to column ids.
 */
export function sanitizeAfterProbe(key: string, value: unknown, usable: ProbeRef[]): { value: unknown; removed: number } {
	const ok = new Set(usable.map(refKey));
	let removed = 0;
	if (key === 'uploadFolder') {
		if (typeof value === 'string' && !ok.has(refKey({ type: 'driveFolder', id: value }))) { removed++; return { value: null, removed }; }
		return { value, removed };
	}
	if (key === 'pinnedUserLists' && Array.isArray(value)) {
		const kept = value.filter(l => l != null && typeof l === 'object' && ok.has(refKey({ type: 'list', id: (l as { id: string }).id })));
		return { value: kept, removed: value.length - kept.length };
	}
	if (key === 'deck.profiles' && Array.isArray(value)) {
		const kept = value.filter(p => !holdsUnusable(p, ok));
		return { value: kept, removed: value.length - kept.length };
	}
	const clean = (v: unknown): unknown => {
		if (Array.isArray(v)) {
			const kept: unknown[] = [];
			for (const x of v) {
				if (x != null && typeof x === 'object' && !Array.isArray(x) && holdsUnusable(x, ok)) { removed++; continue; }
				kept.push(clean(x));
			}
			return kept;
		}
		if (v != null && typeof v === 'object') {
			const o: Record<string, unknown> = {};
			for (const [k, x] of Object.entries(v)) {
				const r = refOfEntry(k, x);
				o[k] = r != null && !ok.has(refKey(r)) ? (removed++, null) : clean(x);
			}
			return o;
		}
		return v;
	};
	return { value: clean(value), removed };
}
