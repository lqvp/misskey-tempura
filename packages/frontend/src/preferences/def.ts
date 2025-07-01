/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { hemisphere } from '@@/js/intl-const.js';
import { definePreferences } from './manager.js';
import type { Theme } from '@/theme.js';
import type { SoundType } from '@/utility/sound.js';
import type { Plugin } from '@/plugin.js';
import type { DeviceKind } from '@/utility/device-kind.js';
import type { DeckProfile } from '@/deck.js';
import type { WatermarkPreset } from '@/utility/watermark.js';
import { genId } from '@/utility/id.js';
import { DEFAULT_DEVICE_KIND } from '@/utility/device-kind.js';
import { deepEqual } from '@/utility/deep-equal.js';

/** サウンド設定 */
export type SoundStore = {
	type: Exclude<SoundType, '_driveFile_'>;
	volume: number;
} | {
	type: '_driveFile_';

	/** ドライブのファイルID */
	fileId: string;

	/** ファイルURL（こちらが優先される） */
	fileUrl: string;

	volume: number;
};

// NOTE: デフォルト値は他の設定の状態に依存してはならない(依存していた場合、ユーザーがその設定項目単体で「初期値にリセット」した場合不具合の原因になる)

export const PREF_DEF = definePreferences({
	accounts: {
		default: [] as [host: string, user: {
			id: string;
			username: string;
		}][],
	},

	pinnedUserLists: {
		accountDependent: true,
		default: [] as Misskey.entities.UserList[],
	},
	uploadFolder: {
		accountDependent: true,
		default: null as string | null,
	},
	widgets: {
		accountDependent: true,
		default: () => [{
			name: 'calendar',
			id: genId(), place: 'right', data: {},
		}, {
			name: 'notifications',
			id: genId(), place: 'right', data: {},
		}, {
			name: 'trends',
			id: genId(), place: 'right', data: {},
		}] as {
			name: string;
			id: string;
			place: string | null;
			data: Record<string, any>;
		}[],
	},
	'deck.profile': {
		accountDependent: true,
		default: null as string | null,
	},
	'deck.profiles': {
		accountDependent: true,
		default: [] as DeckProfile[],
	},

	emojiPalettes: {
		serverDependent: true,
		default: () => [{
			id: genId(),
			name: '',
			emojis: ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮'],
		}] as {
			id: string;
			name: string;
			emojis: string[];
		}[],
		mergeStrategy: (a, b) => {
			const mergedItems = [] as typeof a;
			for (const x of a.concat(b)) {
				const sameIdItem = mergedItems.find(y => y.id === x.id);
				if (sameIdItem != null) {
					if (deepEqual(x, sameIdItem)) { // 完全な重複は無視
						continue;
					} else { // IDは同じなのに内容が違う場合はマージ不可とする
						throw new Error();
					}
				} else {
					mergedItems.push(x);
				}
			}
			return mergedItems;
		},
	},
	emojiPaletteForReaction: {
		serverDependent: true,
		default: null as string | null,
	},
	emojiPaletteForMain: {
		serverDependent: true,
		default: null as string | null,
	},

	overridedDeviceKind: {
		default: null as DeviceKind | null,
	},
	themes: {
		default: [] as Theme[],
		mergeStrategy: (a, b) => {
			const mergedItems = [] as typeof a;
			for (const x of a.concat(b)) {
				const sameIdItem = mergedItems.find(y => y.id === x.id);
				if (sameIdItem != null) {
					if (deepEqual(x, sameIdItem)) { // 完全な重複は無視
						continue;
					} else { // IDは同じなのに内容が違う場合はマージ不可とする
						throw new Error();
					}
				} else {
					mergedItems.push(x);
				}
			}
			return mergedItems;
		},
	},
	lightTheme: {
		default: null as Theme | null,
	},
	darkTheme: {
		default: null as Theme | null,
	},
	syncDeviceDarkMode: {
		default: true,
	},
	defaultNoteVisibility: {
		default: 'public' as (typeof Misskey.noteVisibilities)[number],
	},
	defaultNoteLocalOnly: {
		default: false,
	},
	keepCw: {
		default: true,
	},
	rememberNoteVisibility: {
		default: false,
	},
	reportError: {
		default: false,
	},
	collapseRenotes: {
		default: true,
	},
	menu: {
		default: [
			'notifications',
			'clips',
			'drive',
			'followRequests',
			'chat',
			'-',
			'explore',
			'announcements',
			'channels',
			'search',
			'-',
			'ui',
		],
	},
	statusbars: {
		default: [] as {
			name: string;
			id: string;
			type: string;
			size: 'verySmall' | 'small' | 'medium' | 'large' | 'veryLarge';
			black: boolean;
			props: Record<string, any>;
		}[],
	},
	serverDisconnectedBehavior: {
		default: 'quiet' as 'quiet' | 'reload' | 'dialog',
	},
	nsfw: {
		default: 'respect' as 'respect' | 'force' | 'ignore',
	},
	highlightSensitiveMedia: {
		default: false,
	},
	animation: {
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	animatedMfm: {
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	advancedMfm: {
		default: true,
	},
	showReactionsCount: {
		default: false,
	},
	enableQuickAddMfmFunction: {
		default: false,
	},
	loadRawImages: {
		default: false,
	},
	imageNewTab: {
		default: false,
	},
	disableShowingAnimatedImages: {
		default: window.matchMedia('(prefers-reduced-motion)').matches,
	},
	emojiStyle: {
		default: 'twemoji', // twemoji / fluentEmoji / native
	},
	menuStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	useBlurEffectForModal: {
		default: true,
	},
	useBlurEffect: {
		default: true,
	},
	useStickyIcons: {
		default: true,
	},
	enableHighQualityImagePlaceholders: {
		default: true,
	},
	showFixedPostForm: {
		default: false,
	},
	showFixedPostFormInChannel: {
		default: false,
	},
	enableInfiniteScroll: {
		default: true,
	},
	useReactionPickerForContextMenu: {
		default: false,
	},
	instanceTicker: {
		default: 'remote' as 'none' | 'remote' | 'always',
	},
	emojiPickerScale: {
		default: 2,
	},
	emojiPickerWidth: {
		default: 2,
	},
	emojiPickerHeight: {
		default: 3,
	},
	emojiPickerStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	squareAvatars: {
		default: false,
	},
	showAvatarDecorations: {
		default: true,
	},
	numberOfPageCache: {
		default: 3,
	},
	pollingInterval: {
		// 1 ... 低
		// 2 ... 中
		// 3 ... 高
		default: 2,
	},
	showNoteActionsOnlyHover: {
		default: false,
	},
	showClipButtonInNoteFooter: {
		default: false,
	},
	reactionsDisplaySize: {
		default: 'medium' as 'small' | 'medium' | 'large',
	},
	limitWidthOfReaction: {
		default: true,
	},
	forceShowAds: {
		default: false,
	},
	aiChanMode: {
		default: false,
	},
	devMode: {
		default: false,
	},
	mediaListWithOneImageAppearance: {
		default: 'expand' as 'expand' | '16_9' | '1_1' | '2_3',
	},
	notificationPosition: {
		default: 'rightBottom' as 'leftTop' | 'leftBottom' | 'rightTop' | 'rightBottom',
	},
	notificationStackAxis: {
		default: 'horizontal' as 'vertical' | 'horizontal',
	},
	enableCondensedLine: {
		default: true,
	},
	keepScreenOn: {
		default: false,
	},
	useGroupedNotifications: {
		default: true,
	},
	dataSaver: {
		default: {
			media: false,
			avatar: false,
			urlPreviewThumbnail: false,
			disableUrlPreview: false,
			code: false,
		} satisfies Record<string, boolean>,
	},
	hemisphere: {
		default: hemisphere as 'N' | 'S',
	},
	enableSeasonalScreenEffect: {
		default: false,
	},
	enableHorizontalSwipe: {
		default: false,
	},
	enablePullToRefresh: {
		default: true,
	},
	useNativeUiForVideoAudioPlayer: {
		default: false,
	},
	keepOriginalFilename: {
		default: true,
	},
	alwaysConfirmFollow: {
		default: true,
	},
	confirmWhenRevealingSensitiveMedia: {
		default: false,
	},
	contextMenu: {
		default: 'app' as 'app' | 'appWithShift' | 'native',
	},
	skipNoteRender: {
		default: true,
	},
	showSoftWordMutedWord: {
		default: false,
	},
	confirmOnReact: {
		default: false,
	},
	defaultFollowWithReplies: {
		default: false,
	},
	makeEveryTextElementsSelectable: {
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	showNavbarSubButtons: {
		default: true,
	},
	showTitlebar: {
		default: false,
	},
	showAvailableReactionsFirstInNote: {
		default: false,
	},
	plugins: {
		default: [] as Plugin[],
		mergeStrategy: (a, b) => {
			const sameIdExists = a.some(x => b.some(y => x.installId === y.installId));
			if (sameIdExists) throw new Error();
			const sameNameExists = a.some(x => b.some(y => x.name === y.name));
			if (sameNameExists) throw new Error();
			return a.concat(b);
		},
	},
	mutingEmojis: {
		default: [] as string[],
		mergeStrategy: (a, b) => {
			return [...new Set(a.concat(b))];
		},
	},
	watermarkPresets: {
		accountDependent: true,
		default: [] as WatermarkPreset[],
		mergeStrategy: (a, b) => {
			const mergedItems = [] as typeof a;
			for (const x of a.concat(b)) {
				const sameIdItem = mergedItems.find(y => y.id === x.id);
				if (sameIdItem != null) {
					if (deepEqual(x, sameIdItem)) { // 完全な重複は無視
						continue;
					} else { // IDは同じなのに内容が違う場合はマージ不可とする
						throw new Error();
					}
				} else {
					mergedItems.push(x);
				}
			}
			return mergedItems;
		},
	},
	defaultWatermarkPresetId: {
		accountDependent: true,
		default: null as WatermarkPreset['id'] | null,
	},
	defaultImageCompressionLevel: {
		default: 2 as 0 | 1 | 2 | 3,
	},

	'sound.masterVolume': {
		default: 0.5,
	},
	'sound.notUseSound': {
		default: false,
	},
	'sound.useSoundOnlyWhenActive': {
		default: false,
	},
	'sound.on.note': {
		default: { type: 'syuilo/n-aec', volume: 1 } as SoundStore,
	},
	'sound.on.noteMy': {
		default: { type: 'syuilo/n-cea-4va', volume: 1 } as SoundStore,
	},
	'sound.on.notification': {
		default: { type: 'syuilo/n-ea', volume: 1 } as SoundStore,
	},
	'sound.on.reaction': {
		default: { type: 'syuilo/bubble2', volume: 1 } as SoundStore,
	},
	'sound.on.chatMessage': {
		default: { type: 'syuilo/waon', volume: 1 } as SoundStore,
	},

	'deck.alwaysShowMainColumn': {
		default: true,
	},
	'deck.navWindow': {
		default: true,
	},
	'deck.useSimpleUiForNonRootPages': {
		default: true,
	},
	'deck.columnAlign': {
		default: 'center' as 'left' | 'right' | 'center',
	},
	'deck.columnGap': {
		default: 6,
	},
	'deck.menuPosition': {
		default: 'bottom' as 'right' | 'bottom',
	},
	'deck.navbarPosition': {
		default: 'left' as 'left' | 'top' | 'bottom',
	},
	'deck.wallpaper': {
		default: null as string | null,
	},

	'chat.showSenderName': {
		default: false,
	},
	'chat.sendOnEnter': {
		default: false,
	},

	'game.dropAndFusion': {
		default: {
			bgmVolume: 0.25,
			sfxVolume: 1,
		},
	},

	'experimental.stackingRouterView': {
		default: false,
	},
	'experimental.enableFolderPageView': {
		default: false,
	},
	postFormActions: {
		default: [
			'attachFileUpload',
			'attachFileFromDrive',
			'poll',
			'scheduledNoteDelete',
			'useCw',
			'mention',
			'hashtags',
			'plugins',
			'addMfmFunction',
			'scheduleNote',
			'schedulePostList',
		],
	},
	defaultScheduledNoteDelete: {
		default: false,
	},
	defaultScheduledNoteDeleteTime: {
		default: 86400000,
	},
	selectReaction: {
		default: '🩷' as string,
	},
	showLikeButton: {
		default: true,
	},
	hideReactionUsers: {
		default: false,
	},
	hideReactionCount: {
		default: 'none' as 'none' | 'self' | 'others' | 'all',
	},
	customFont: {
		default: null as null | string,
	},
	disableNoteNyaize: {
		default: false,
	},
	hideLocalTimeLine: {
		default: false,
	},
	hideSocialTimeLine: {
		default: false,
	},
	hideGlobalTimeLine: {
		default: false,
	},
	hideLists: {
		default: false,
	},
	hideAntennas: {
		default: false,
	},
	hideChannel: {
		default: false,
	},
	nicknameEnabled: {
		default: true,
	},
	nicknameMap: {
		default: {} as Record<string, string>,
	},
	directRenote: {
		default: false,
	},
	reactionChecksMuting: {
		default: true,
	},
	anonymizeMutedUsers: {
		default: true,
	},
	enableReactionConfirm: {
		default: false,
	},
	enableLikeConfirm: {
		default: false,
	},
	showInstanceTickerSoftwareName: {
		default: false,
	},
	showInstanceTickerVersion: {
		default: false,
	},
	useTextAreaAutoSize: {
		default: false,
	},
	specifiedUsers: {
		default: [] as string[],
	},
	useGeminiLLMAPI: {
		default: false,
	},
	useGeminiWithMedia: {
		default: true,
	},
	geminiToken: {
		default: null as string | null,
	},
	geminiModel: {
		default: 'gemini-2.5-flash' as string | null,
	},
	geminiSystemPrompt: {
		default: 'リスト記法は対応しておらず、パーサーが壊れるため使用禁止です。列挙する場合は「・」を使ってください。' as string | null,
	},
	geminiPromptNote: {
		default: '以下のSNSの投稿をわかりやすく簡潔にユーザーに要約せよ。' as string | null,
	},
	geminiPromptProfile: {
		default: 'プロフィール情報と投稿からこのユーザーの特徴を簡潔に教えて。' as string | null,
	},
	geminiNoteLongText: {
		default: '以下の文章を長文にしてください。' as string | null,
	},
	geminiNoteShortText: {
		default: '以下の文章を短文にしてください。' as string | null,
	},
	geminiNoteSimpleText: {
		default: '以下の文章を簡潔にしてください。' as string | null,
	},
	geminiNoteCasualText: {
		default: '以下の文章をカジュアルにしてください。' as string | null,
	},
	geminiNoteProfessionalText: {
		default: '以下の文章を専門的にしてください。' as string | null,
	},
	geminiNoteCatText: {
		default: '以下の文章を猫っぽくしてください。' as string | null,
	},
	geminiNoteCustomText: {
		default: null as string | null,
	},
	geminiThinkingBudget: {
		default: -1 as number,
	},
	enableEarthquakeWarning: {
		default: false,
	},
	earthquakeWarningIntensity: {
		default: '3', // Default threshold is intensity 3
	},
	enableEarthquakeWarningTts: {
		default: false,
	},
	earthquakeWarningTtsVoice: {
		default: null as string | null,
	},
	earthquakeWarningToastDuration: {
		default: 10000, // 10秒
	},
	earthquakeWarningTtsRate: {
		default: 1.0, // 標準速度
	},
	earthquakeWarningNotificationStyle: {
		default: 'standard', // 'detailed', 'standard', 'simple'
	},
	earthquakeWarningSound: {
		default: true, // 通知音を有効
	},
	earthquakeWarningSoundType: {
		default: 'auto', // 'eew', 'info', 'auto'
	},
	earthquakeWarningRegionFilter: {
		default: [] as string[], // 通知する地域のリスト（空の場合はすべての地域）
	},
	enableEarthquakeWarningRegionFilter: {
		default: false,
	},
	earthquakeWarningThrottleTime: {
		default: 60, // 秒
	},
	earthquakeWarningIgnoreTraining: {
		default: true,
	},
	earthquakeWarningConnectionNotify: {
		default: true,
	},
	earthquakeWarningLogLevel: {
		default: 'basic', // 'none', 'basic', 'detailed'
	},
	earthquakeWarningReportNumber: {
		default: null as number | null, // 通知する第n報（nullなら無効）
	},
	earthquakeWarningFinalOnly: {
		default: false, // 最終報のみ通知
	},
	earthquakeWarningReportFilterMode: {
		default: 'any' as 'any' | 'nth' | 'final' | 'both', // フィルタモード
	},
	skipPasteUploadDialog: {
		default: false,
	},
	useNoteVisibilityColoring: {
		default: false,
	},
	noteVisibilityColorPublicNonLtl: {
		default: '#86B300',
	},
	noteVisibilityColorHome: {
		default: '#FFB900',
	},
	noteVisibilityColorFollowers: {
		default: '#0078D7',
	},
	noteVisibilityColorSpecified: {
		default: '#111111',
	},
	noteVisibilityColorLocalOnly: {
		default: '#B93E43',
	},
});
