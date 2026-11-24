/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { classifyMediaProxyUrl, resolveMediaProxy, type Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type { UsersRepository } from '@/models/_.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { QueueService } from '@/core/QueueService.js';
import { ApiLoggerService } from '../../ApiLoggerService.js';
import { ApiError } from '../../error.js';
import { normalizeSignupPassphrase } from '@/misc/normalize-signup-passphrase.js';
import { reconcileUserMediaProxyUrls } from '@/misc/rewrite-user-media-proxy-urls.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

	errors: {
		followedUserDuplicated: {
			message: 'Some items in "defaultFollowedUsers" and "forciblyFollowedUsers" are duplicated.',
			code: 'FOLLOWED_USER_DUPLICATED',
			id: 'bcf088ec-fec5-42d0-8b9e-16d3b4797a4d',
		},
		invalidLoginRiskThresholds: {
			message: 'loginRiskNotifyThreshold must be less than loginRiskStepUpThreshold.',
			code: 'INVALID_LOGIN_RISK_THRESHOLDS',
			id: '0b4b9a0e-6f0d-4c8e-9d3a-5f2f7a1c8e41',
		},
		invalidMediaProxyUrl: {
			message: 'mediaProxy must be a valid http(s) URL without credentials, query, or hash, and must not point to this server\'s own /proxy or origin root.',
			code: 'INVALID_MEDIA_PROXY_URL',
			id: '9529a736-ac90-4d8f-a85c-e9bd75de96f2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		disableRegistration: { type: 'boolean', nullable: true },
		pinnedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		hiddenTags: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		blockedHosts: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		sensitiveWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWordsForNameOfUser: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		themeColor: { type: 'string', nullable: true, pattern: '^#[0-9a-fA-F]{6}$' },
		mascotImageUrl: { type: 'string', nullable: true },
		bannerUrl: { type: 'string', nullable: true },
		serverErrorImageUrl: { type: 'string', nullable: true },
		infoImageUrl: { type: 'string', nullable: true },
		notFoundImageUrl: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		app192IconUrl: { type: 'string', nullable: true },
		app512IconUrl: { type: 'string', nullable: true },
		backgroundImageUrl: { type: 'string', nullable: true },
		logoImageUrl: { type: 'string', nullable: true },
		name: { type: 'string', nullable: true },
		shortName: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		defaultLightTheme: { type: 'string', nullable: true },
		defaultDarkTheme: { type: 'string', nullable: true },
		clientOptions: {
			type: 'object', nullable: false,
			properties: {
				entrancePageStyle: { type: 'string', nullable: false, enum: ['classic', 'simple'] },
				showTimelineForVisitor: { type: 'boolean', nullable: false },
				showActivitiesForVisitor: { type: 'boolean', nullable: false },
			},
		},
		cacheRemoteFiles: { type: 'boolean' },
		cacheRemoteSensitiveFiles: { type: 'boolean' },
		emailRequiredForSignup: { type: 'boolean' },
		enableHcaptcha: { type: 'boolean' },
		hcaptchaSiteKey: { type: 'string', nullable: true },
		hcaptchaSecretKey: { type: 'string', nullable: true },
		enableMcaptcha: { type: 'boolean' },
		mcaptchaSiteKey: { type: 'string', nullable: true },
		mcaptchaInstanceUrl: { type: 'string', nullable: true },
		mcaptchaSecretKey: { type: 'string', nullable: true },
		enableRecaptcha: { type: 'boolean' },
		recaptchaSiteKey: { type: 'string', nullable: true },
		recaptchaSecretKey: { type: 'string', nullable: true },
		enableTurnstile: { type: 'boolean' },
		turnstileSiteKey: { type: 'string', nullable: true },
		turnstileSecretKey: { type: 'string', nullable: true },
		enableTestcaptcha: { type: 'boolean' },
		googleAnalyticsMeasurementId: { type: 'string', nullable: true },
		sensitiveMediaDetection: { type: 'string', enum: ['none', 'all', 'local', 'remote'] },
		sensitiveMediaDetectionSensitivity: { type: 'string', enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'] },
		setSensitiveFlagAutomatically: { type: 'boolean' },
		enableSensitiveMediaDetectionForVideos: { type: 'boolean' },
		sensitiveMediaDetectionApiUrl: { type: 'string', nullable: true },
		sensitiveMediaDetectionApiKey: { type: 'string', nullable: true },
		sensitiveMediaDetectionTimeout: { type: 'integer', minimum: 1 },
		sensitiveMediaDetectionMaxImagesPerRequest: { type: 'integer', minimum: 1 },
		maintainerName: { type: 'string', nullable: true },
		maintainerEmail: { type: 'string', nullable: true },
		langs: {
			type: 'array', items: {
				type: 'string',
			},
		},
		deeplAuthKey: { type: 'string', nullable: true },
		deeplIsPro: { type: 'boolean' },
		enableEmail: { type: 'boolean' },
		email: { type: 'string', nullable: true },
		smtpSecure: { type: 'boolean' },
		smtpHost: { type: 'string', nullable: true },
		smtpPort: { type: 'integer', nullable: true },
		smtpUser: { type: 'string', nullable: true },
		smtpPass: { type: 'string', nullable: true },
		enableServiceWorker: { type: 'boolean' },
		swPublicKey: { type: 'string', nullable: true },
		swPrivateKey: { type: 'string', nullable: true },
		tosUrl: { type: 'string', nullable: true },
		repositoryUrl: { type: 'string', nullable: true },
		feedbackUrl: { type: 'string', nullable: true },
		impressumUrl: { type: 'string', nullable: true },
		privacyPolicyUrl: { type: 'string', nullable: true },
		inquiryUrl: { type: 'string', nullable: true },
		useObjectStorage: { type: 'boolean' },
		objectStorageBaseUrl: { type: 'string', nullable: true },
		objectStorageBucket: { type: 'string', nullable: true },
		objectStoragePrefix: { type: 'string', pattern: /^[a-zA-Z0-9-._]*$/.source, nullable: true },
		objectStorageEndpoint: { type: 'string', nullable: true },
		objectStorageRegion: { type: 'string', nullable: true },
		objectStoragePort: { type: 'integer', nullable: true },
		objectStorageAccessKey: { type: 'string', nullable: true },
		objectStorageSecretKey: { type: 'string', nullable: true },
		objectStorageUseSSL: { type: 'boolean' },
		objectStorageUseProxy: { type: 'boolean' },
		objectStorageSetPublicRead: { type: 'boolean' },
		objectStorageS3ForcePathStyle: { type: 'boolean' },
		enableIpLogging: { type: 'boolean' },
		enableActiveEmailValidation: { type: 'boolean' },
		enableVerifymailApi: { type: 'boolean' },
		verifymailAuthKey: { type: 'string', nullable: true },
		enableTruemailApi: { type: 'boolean' },
		truemailInstance: { type: 'string', nullable: true },
		truemailAuthKey: { type: 'string', nullable: true },
		enableChartsForRemoteUser: { type: 'boolean' },
		enableChartsForFederatedInstances: { type: 'boolean' },
		enableStatsForFederatedInstances: { type: 'boolean' },
		enableServerMachineStats: { type: 'boolean' },
		enableIdenticonGeneration: { type: 'boolean' },
		serverRules: { type: 'array', items: { type: 'string' } },
		bannedEmailDomains: { type: 'array', items: { type: 'string' } },
		preservedUsernames: { type: 'array', items: { type: 'string' } },
		manifestJsonOverride: { type: 'string' },
		enableFanoutTimeline: { type: 'boolean' },
		enableFanoutTimelineDbFallback: { type: 'boolean' },
		perLocalUserUserTimelineCacheMax: { type: 'integer' },
		perRemoteUserUserTimelineCacheMax: { type: 'integer' },
		perUserHomeTimelineCacheMax: { type: 'integer' },
		perUserListTimelineCacheMax: { type: 'integer' },
		enableReactionsBuffering: { type: 'boolean' },
		notesPerOneAd: { type: 'integer' },
		silencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		mediaSilencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		summalyProxy: {
			type: 'string', nullable: true,
			description: '[Deprecated] Use "urlPreviewSummaryProxyUrl" instead.',
		},
		urlPreviewEnabled: { type: 'boolean' },
		urlPreviewAllowRedirect: { type: 'boolean' },
		urlPreviewTimeout: { type: 'integer' },
		urlPreviewMaximumContentLength: { type: 'integer' },
		urlPreviewRequireContentLength: { type: 'boolean' },
		urlPreviewUserAgent: { type: 'string', nullable: true },
		urlPreviewSummaryProxyUrl: { type: 'string', nullable: true },
		urlPreviewSensitiveList: {
			type: 'array', nullable: true,
			items: {
				type: 'string',
			}
		},
		federation: {
			type: 'string',
			enum: ['all', 'none', 'specified'],
		},
		federationHosts: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		deliverSuspendedSoftware: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					software: { type: 'string' },
					versionRange: { type: 'string' },
				},
				required: ['software', 'versionRange'],
			},
		},
		singleUserMode: { type: 'boolean' },
		ugcVisibilityForVisitor: {
			type: 'string',
			enum: ['all', 'local', 'none'],
		},
		proxyRemoteFiles: { type: 'boolean' },
		signToActivityPubGet: { type: 'boolean' },
		allowExternalApRedirect: { type: 'boolean' },
		enableRemoteNotesCleaning: { type: 'boolean' },
		remoteNotesCleaningExpiryDaysForEachNotes: { type: 'number' },
		remoteNotesCleaningMaxProcessingDurationInMinutes: { type: 'number' },
		showRoleBadgesOfRemoteUsers: { type: 'boolean' },
		// tempura: フォーク独自の設定
		youBlockedImageUrl: { type: 'string', nullable: true },
		enableLongIconUrl: { type: 'boolean' },
		longIconUrl: { type: 'string', nullable: true },
		backgroundImageUrls: { type: 'array', nullable: true },
		approvalRequiredForSignup: { type: 'boolean' },
		defaultRequireSigninToViewContents: { type: 'boolean' },
		openLlmModerationEnabled: { type: 'boolean' },
		openLlmModerationApiKey: { type: 'string', nullable: true },
		openLlmModerationIncludeRemote: { type: 'boolean' },
		openLlmModerationVisibilities: {
			type: 'array',
			items: {
				type: 'string',
				enum: ['public', 'public_non_ltl', 'home', 'followers', 'specified'],
			},
		},
		openLlmModerationApiUrl: { type: 'string', nullable: true },
		openLlmModerationModel: { type: 'string', nullable: true },
		objectStoragePrefixForRemote: { type: 'string', nullable: true },
		objectStorageCacheDays: { type: 'integer', nullable: true },
		enableLoginRiskDetection: { type: 'boolean' },
		loginRiskNotifyThreshold: { type: 'integer', minimum: 1, maximum: 1000 },
		loginRiskStepUpThreshold: { type: 'integer', minimum: 1, maximum: 1000 },
		loginRiskFlagUnverifiedUsers: { type: 'boolean' },
		loginRiskShowDetailsToUser: { type: 'boolean' },
		emailWhitelist: { type: 'boolean' },
		blockMentionsFromUnfamiliarRemoteUsers: { type: 'boolean' },
		validateMinimumUsernameLength: { type: 'integer', minimum: 1, maximum: 20 },
		useHanaEntrance: { type: 'boolean' },
		hanaThemeColor: { type: 'string' },
		hanaThemeAltColor: { type: 'string' },
		hanaThemeWeakOpacity: { type: 'number' },
		hanaModeIcon: { type: 'string', nullable: true },
		hanaModeIconSize: { type: 'number' },
		hanaModeIconRadius: { type: 'number' },
		hanaModeBackground: { type: 'string', nullable: true },
		requireSignedApFetch: { type: 'boolean' },
		allowUnregisteredApSignerVerification: { type: 'boolean' },
		proxyAccountFollowMode: { type: 'string', enum: ['always', 'skipIfFollowed', 'disabled'] },
		allowAnonymousStats: { type: 'boolean' },
		allowAnonymousOnlineUsersCount: { type: 'boolean' },
		allowAnonymousChartActiveUsers: { type: 'boolean' },
		allowAnonymousChartApRequest: { type: 'boolean' },
		allowAnonymousChartDrive: { type: 'boolean' },
		allowAnonymousChartFederation: { type: 'boolean' },
		allowAnonymousChartInstance: { type: 'boolean' },
		allowAnonymousChartNotes: { type: 'boolean' },
		allowAnonymousChartUsers: { type: 'boolean' },
		allowAnonymousFederationUsers: { type: 'boolean' },
		allowAnonymousFederationStats: { type: 'boolean' },
		allowAnonymousShowInstance: { type: 'boolean' },
		allowAnonymousReplies: { type: 'boolean' },
		allowAnonymousRenotes: { type: 'boolean' },
		allowAnonymousQuotes: { type: 'boolean' },
		allowAnonymousFederationInstances: { type: 'boolean' },
		allowAnonymousFeatured: { type: 'boolean' },
		allowAnonymousLocalTimeline: { type: 'boolean' },
		allowAnonymousReactions: { type: 'boolean' },
		customSplashText: { type: 'array', nullable: true, items: {
			type: 'string',
		} },
		offlinePageConfig: { type: 'string', nullable: true },
		mediaProxy: { type: 'string', nullable: true, maxLength: 256 },
		defaultFollowedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
				format: 'misskey:id',
			},
		},
		forciblyFollowedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
				format: 'misskey:id',
			},
		},
		deeplFreeMode: { type: 'boolean' },
		deeplFreeInstance: { type: 'string', nullable: true },
		enableCpuModel: { type: 'boolean' },
		customCpuModel: { type: 'string', nullable: true },
		enableCpuCore: { type: 'boolean' },
		customCpuCore: { type: 'integer', nullable: true },
		enableMemTotal: { type: 'boolean' },
		customMemTotal: { type: 'integer', nullable: true },
		enableFsTotal: { type: 'boolean' },
		customFsTotal: { type: 'integer', nullable: true },
		secondsPerSignup: { type: 'integer' },
		fixedInviteCode: { type: 'string', nullable: true, maxLength: 128 },
		signupPassphrase: { type: 'string', nullable: true, maxLength: 256 },
		entranceShowTimeLine: { type: 'boolean' },
		entranceShowFeatured: { type: 'boolean' },
		entranceShowEmojis: { type: 'boolean' },
		entranceSelectEmojis: { type: 'array', items: { type: 'string' } },
		entranceShowStats: { type: 'boolean' },
		entranceShowFederation: { type: 'boolean' },
		entranceShowDashboard: { type: 'boolean' },
		entranceShowSignup: { type: 'boolean' },
		entranceShowAnotherInstance: { type: 'boolean' },
		entranceShowSignin: { type: 'boolean' },
		entranceMarginLeft: { type: 'integer' },
		entranceMarginRight: { type: 'integer' },
		entranceMarginTop: { type: 'integer' },
		entranceMarginBottom: { type: 'integer' },
		serverOpenAIEnabled: { type: 'boolean' },
		serverOpenAIApiKey: { type: 'string', nullable: true, maxLength: 1024 },
		serverOpenAIBaseURL: { type: 'string', nullable: true, maxLength: 512 },
		serverOpenAIModels: { type: 'string', nullable: false, maxLength: 512 },
		customCursorUrl: { type: 'string', nullable: true },
		customCursorPointerUrl: { type: 'string', nullable: true },
		customCursorTextUrl: { type: 'string', nullable: true },
		customCursorProgressUrl: { type: 'string', nullable: true },
		customCursorWaitUrl: { type: 'string', nullable: true },
		// Contact Form Settings
		enableContactForm: { type: 'boolean' },
		contactFormLimit: { type: 'integer', minimum: 1, maximum: 10 },
		contactFormRequireAuth: { type: 'boolean' },
		contactFormCategories: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					key: { type: 'string', maxLength: 64 },
					text: { type: 'string', maxLength: 256 },
					enabled: { type: 'boolean' },
					order: { type: 'integer', minimum: 1 },
					isDefault: { type: 'boolean' },
				},
				required: ['key', 'text', 'enabled', 'order', 'isDefault'],
			},
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private rewriteChain: Promise<void> = Promise.resolve();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private metaService: MetaService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		private queueService: QueueService,
		private apiLoggerService: ApiLoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const set = {} as Partial<MiMeta>;

			if (typeof ps.disableRegistration === 'boolean') {
				set.disableRegistration = ps.disableRegistration;
			}

			if (Array.isArray(ps.pinnedUsers)) {
				set.pinnedUsers = ps.pinnedUsers.filter(Boolean);
			}

			if (Array.isArray(ps.hiddenTags)) {
				set.hiddenTags = ps.hiddenTags.filter(Boolean);
			}

			if (Array.isArray(ps.blockedHosts)) {
				set.blockedHosts = ps.blockedHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (Array.isArray(ps.sensitiveWords)) {
				set.sensitiveWords = ps.sensitiveWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWords)) {
				set.prohibitedWords = ps.prohibitedWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWordsForNameOfUser)) {
				set.prohibitedWordsForNameOfUser = ps.prohibitedWordsForNameOfUser.filter(Boolean);
			}
			if (Array.isArray(ps.silencedHosts)) {
				let lastValue = '';
				set.silencedHosts = ps.silencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (Array.isArray(ps.mediaSilencedHosts)) {
				let lastValue = '';
				set.mediaSilencedHosts = ps.mediaSilencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (ps.themeColor !== undefined) {
				set.themeColor = ps.themeColor;
			}

			if (ps.mascotImageUrl !== undefined) {
				set.mascotImageUrl = ps.mascotImageUrl;
			}

			if (ps.bannerUrl !== undefined) {
				set.bannerUrl = ps.bannerUrl;
			}

			if (ps.iconUrl !== undefined) {
				set.iconUrl = ps.iconUrl;
			}

			if (ps.app192IconUrl !== undefined) {
				set.app192IconUrl = ps.app192IconUrl;
			}

			if (ps.app512IconUrl !== undefined) {
				set.app512IconUrl = ps.app512IconUrl;
			}

			if (ps.serverErrorImageUrl !== undefined) {
				set.serverErrorImageUrl = ps.serverErrorImageUrl;
			}

			if (ps.infoImageUrl !== undefined) {
				set.infoImageUrl = ps.infoImageUrl;
			}

			if (ps.notFoundImageUrl !== undefined) {
				set.notFoundImageUrl = ps.notFoundImageUrl;
			}

			if (ps.backgroundImageUrl !== undefined) {
				set.backgroundImageUrl = ps.backgroundImageUrl;
			}

			if (ps.logoImageUrl !== undefined) {
				set.logoImageUrl = ps.logoImageUrl;
			}

			if (ps.name !== undefined) {
				set.name = ps.name;
			}

			if (ps.shortName !== undefined) {
				set.shortName = ps.shortName;
			}

			if (ps.description !== undefined) {
				set.description = ps.description;
			}

			if (ps.defaultLightTheme !== undefined) {
				set.defaultLightTheme = ps.defaultLightTheme;
			}

			if (ps.defaultDarkTheme !== undefined) {
				set.defaultDarkTheme = ps.defaultDarkTheme;
			}

			if (ps.clientOptions !== undefined) {
				set.clientOptions = {
					...this.serverSettings.clientOptions,
					...ps.clientOptions,
				};
			}

			if (ps.cacheRemoteFiles !== undefined) {
				set.cacheRemoteFiles = ps.cacheRemoteFiles;
			}

			if (ps.cacheRemoteSensitiveFiles !== undefined) {
				set.cacheRemoteSensitiveFiles = ps.cacheRemoteSensitiveFiles;
			}

			if (ps.emailRequiredForSignup !== undefined) {
				set.emailRequiredForSignup = ps.emailRequiredForSignup;
			}

			if (ps.enableHcaptcha !== undefined) {
				set.enableHcaptcha = ps.enableHcaptcha;
			}

			if (ps.hcaptchaSiteKey !== undefined) {
				set.hcaptchaSiteKey = ps.hcaptchaSiteKey;
			}

			if (ps.hcaptchaSecretKey !== undefined) {
				set.hcaptchaSecretKey = ps.hcaptchaSecretKey;
			}

			if (ps.enableMcaptcha !== undefined) {
				set.enableMcaptcha = ps.enableMcaptcha;
			}

			if (ps.mcaptchaSiteKey !== undefined) {
				set.mcaptchaSitekey = ps.mcaptchaSiteKey;
			}

			if (ps.mcaptchaInstanceUrl !== undefined) {
				set.mcaptchaInstanceUrl = ps.mcaptchaInstanceUrl;
			}

			if (ps.mcaptchaSecretKey !== undefined) {
				set.mcaptchaSecretKey = ps.mcaptchaSecretKey;
			}

			if (ps.enableRecaptcha !== undefined) {
				set.enableRecaptcha = ps.enableRecaptcha;
			}

			if (ps.recaptchaSiteKey !== undefined) {
				set.recaptchaSiteKey = ps.recaptchaSiteKey;
			}

			if (ps.recaptchaSecretKey !== undefined) {
				set.recaptchaSecretKey = ps.recaptchaSecretKey;
			}

			if (ps.enableTurnstile !== undefined) {
				set.enableTurnstile = ps.enableTurnstile;
			}

			if (ps.turnstileSiteKey !== undefined) {
				set.turnstileSiteKey = ps.turnstileSiteKey;
			}

			if (ps.turnstileSecretKey !== undefined) {
				set.turnstileSecretKey = ps.turnstileSecretKey;
			}

			if (ps.enableTestcaptcha !== undefined) {
				set.enableTestcaptcha = ps.enableTestcaptcha;
			}

			if (ps.googleAnalyticsMeasurementId !== undefined) {
				// 空文字列をnullにしたいので??は使わない
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				set.googleAnalyticsMeasurementId = ps.googleAnalyticsMeasurementId || null;
			}

			if (ps.sensitiveMediaDetection !== undefined) {
				set.sensitiveMediaDetection = ps.sensitiveMediaDetection;
			}

			if (ps.sensitiveMediaDetectionSensitivity !== undefined) {
				set.sensitiveMediaDetectionSensitivity = ps.sensitiveMediaDetectionSensitivity;
			}

			if (ps.setSensitiveFlagAutomatically !== undefined) {
				set.setSensitiveFlagAutomatically = ps.setSensitiveFlagAutomatically;
			}

			if (ps.enableSensitiveMediaDetectionForVideos !== undefined) {
				set.enableSensitiveMediaDetectionForVideos = ps.enableSensitiveMediaDetectionForVideos;
			}

			if (ps.sensitiveMediaDetectionApiUrl !== undefined) {
				set.sensitiveMediaDetectionApiUrl = ps.sensitiveMediaDetectionApiUrl === '' ? null : ps.sensitiveMediaDetectionApiUrl;
			}

			if (ps.sensitiveMediaDetectionApiKey !== undefined) {
				set.sensitiveMediaDetectionApiKey = ps.sensitiveMediaDetectionApiKey === '' ? null : ps.sensitiveMediaDetectionApiKey;
			}

			if (ps.sensitiveMediaDetectionTimeout !== undefined) {
				set.sensitiveMediaDetectionTimeout = ps.sensitiveMediaDetectionTimeout;
			}

			if (ps.sensitiveMediaDetectionMaxImagesPerRequest !== undefined) {
				set.sensitiveMediaDetectionMaxImagesPerRequest = ps.sensitiveMediaDetectionMaxImagesPerRequest;
			}

			if (ps.maintainerName !== undefined) {
				set.maintainerName = ps.maintainerName;
			}

			if (ps.maintainerEmail !== undefined) {
				set.maintainerEmail = ps.maintainerEmail;
			}

			if (Array.isArray(ps.langs)) {
				set.langs = ps.langs.filter(Boolean);
			}

			if (ps.enableEmail !== undefined) {
				set.enableEmail = ps.enableEmail;
			}

			if (ps.email !== undefined) {
				set.email = ps.email;
			}

			if (ps.smtpSecure !== undefined) {
				set.smtpSecure = ps.smtpSecure;
			}

			if (ps.smtpHost !== undefined) {
				set.smtpHost = ps.smtpHost;
			}

			if (ps.smtpPort !== undefined) {
				set.smtpPort = ps.smtpPort;
			}

			if (ps.smtpUser !== undefined) {
				set.smtpUser = ps.smtpUser;
			}

			if (ps.smtpPass !== undefined) {
				set.smtpPass = ps.smtpPass;
			}

			if (ps.enableServiceWorker !== undefined) {
				set.enableServiceWorker = ps.enableServiceWorker;
			}

			if (ps.swPublicKey !== undefined) {
				set.swPublicKey = ps.swPublicKey;
			}

			if (ps.swPrivateKey !== undefined) {
				set.swPrivateKey = ps.swPrivateKey;
			}

			if (ps.tosUrl !== undefined) {
				set.termsOfServiceUrl = ps.tosUrl;
			}

			if (ps.repositoryUrl !== undefined) {
				set.repositoryUrl = URL.canParse(ps.repositoryUrl!) ? ps.repositoryUrl : null;
			}

			if (ps.feedbackUrl !== undefined) {
				set.feedbackUrl = ps.feedbackUrl;
			}

			if (ps.impressumUrl !== undefined) {
				set.impressumUrl = ps.impressumUrl;
			}

			if (ps.privacyPolicyUrl !== undefined) {
				set.privacyPolicyUrl = ps.privacyPolicyUrl;
			}

			if (ps.inquiryUrl !== undefined) {
				set.inquiryUrl = ps.inquiryUrl;
			}

			if (ps.useObjectStorage !== undefined) {
				set.useObjectStorage = ps.useObjectStorage;
			}

			if (ps.objectStorageBaseUrl !== undefined) {
				set.objectStorageBaseUrl = ps.objectStorageBaseUrl;
			}

			if (ps.objectStorageBucket !== undefined) {
				set.objectStorageBucket = ps.objectStorageBucket;
			}

			if (ps.objectStoragePrefix !== undefined) {
				set.objectStoragePrefix = ps.objectStoragePrefix;
			}

			if (ps.objectStorageEndpoint !== undefined) {
				set.objectStorageEndpoint = ps.objectStorageEndpoint;
			}

			if (ps.objectStorageRegion !== undefined) {
				set.objectStorageRegion = ps.objectStorageRegion;
			}

			if (ps.objectStoragePort !== undefined) {
				set.objectStoragePort = ps.objectStoragePort;
			}

			if (ps.objectStorageAccessKey !== undefined) {
				set.objectStorageAccessKey = ps.objectStorageAccessKey;
			}

			if (ps.objectStorageSecretKey !== undefined) {
				set.objectStorageSecretKey = ps.objectStorageSecretKey;
			}

			if (ps.objectStorageUseSSL !== undefined) {
				set.objectStorageUseSSL = ps.objectStorageUseSSL;
			}

			if (ps.objectStorageUseProxy !== undefined) {
				set.objectStorageUseProxy = ps.objectStorageUseProxy;
			}

			if (ps.objectStorageSetPublicRead !== undefined) {
				set.objectStorageSetPublicRead = ps.objectStorageSetPublicRead;
			}

			if (ps.objectStorageS3ForcePathStyle !== undefined) {
				set.objectStorageS3ForcePathStyle = ps.objectStorageS3ForcePathStyle;
			}

			if (ps.deeplAuthKey !== undefined) {
				if (ps.deeplAuthKey === '') {
					set.deeplAuthKey = null;
				} else {
					set.deeplAuthKey = ps.deeplAuthKey;
				}
			}

			if (ps.deeplIsPro !== undefined) {
				set.deeplIsPro = ps.deeplIsPro;
			}

			if (ps.enableIpLogging !== undefined) {
				set.enableIpLogging = ps.enableIpLogging;
			}

			if (ps.enableActiveEmailValidation !== undefined) {
				set.enableActiveEmailValidation = ps.enableActiveEmailValidation;
			}

			if (ps.enableVerifymailApi !== undefined) {
				set.enableVerifymailApi = ps.enableVerifymailApi;
			}

			if (ps.verifymailAuthKey !== undefined) {
				if (ps.verifymailAuthKey === '') {
					set.verifymailAuthKey = null;
				} else {
					set.verifymailAuthKey = ps.verifymailAuthKey;
				}
			}

			if (ps.enableTruemailApi !== undefined) {
				set.enableTruemailApi = ps.enableTruemailApi;
			}

			if (ps.truemailInstance !== undefined) {
				if (ps.truemailInstance === '') {
					set.truemailInstance = null;
				} else {
					set.truemailInstance = ps.truemailInstance;
				}
			}

			if (ps.truemailAuthKey !== undefined) {
				if (ps.truemailAuthKey === '') {
					set.truemailAuthKey = null;
				} else {
					set.truemailAuthKey = ps.truemailAuthKey;
				}
			}

			if (ps.enableChartsForRemoteUser !== undefined) {
				set.enableChartsForRemoteUser = ps.enableChartsForRemoteUser;
			}

			if (ps.enableChartsForFederatedInstances !== undefined) {
				set.enableChartsForFederatedInstances = ps.enableChartsForFederatedInstances;
			}

			if (ps.enableStatsForFederatedInstances !== undefined) {
				set.enableStatsForFederatedInstances = ps.enableStatsForFederatedInstances;
			}

			if (ps.enableServerMachineStats !== undefined) {
				set.enableServerMachineStats = ps.enableServerMachineStats;
			}

			if (ps.enableIdenticonGeneration !== undefined) {
				set.enableIdenticonGeneration = ps.enableIdenticonGeneration;
			}

			if (ps.serverRules !== undefined) {
				set.serverRules = ps.serverRules;
			}

			if (ps.preservedUsernames !== undefined) {
				set.preservedUsernames = ps.preservedUsernames;
			}

			if (ps.manifestJsonOverride !== undefined) {
				set.manifestJsonOverride = ps.manifestJsonOverride;
			}

			if (ps.enableFanoutTimeline !== undefined) {
				set.enableFanoutTimeline = ps.enableFanoutTimeline;
			}

			if (ps.enableFanoutTimelineDbFallback !== undefined) {
				set.enableFanoutTimelineDbFallback = ps.enableFanoutTimelineDbFallback;
			}

			if (ps.perLocalUserUserTimelineCacheMax !== undefined) {
				set.perLocalUserUserTimelineCacheMax = ps.perLocalUserUserTimelineCacheMax;
			}

			if (ps.perRemoteUserUserTimelineCacheMax !== undefined) {
				set.perRemoteUserUserTimelineCacheMax = ps.perRemoteUserUserTimelineCacheMax;
			}

			if (ps.perUserHomeTimelineCacheMax !== undefined) {
				set.perUserHomeTimelineCacheMax = ps.perUserHomeTimelineCacheMax;
			}

			if (ps.perUserListTimelineCacheMax !== undefined) {
				set.perUserListTimelineCacheMax = ps.perUserListTimelineCacheMax;
			}

			if (ps.enableReactionsBuffering !== undefined) {
				set.enableReactionsBuffering = ps.enableReactionsBuffering;
			}

			if (ps.notesPerOneAd !== undefined) {
				set.notesPerOneAd = ps.notesPerOneAd;
			}

			if (ps.bannedEmailDomains !== undefined) {
				set.bannedEmailDomains = ps.bannedEmailDomains;
			}

			if (ps.urlPreviewEnabled !== undefined) {
				set.urlPreviewEnabled = ps.urlPreviewEnabled;
			}

			if (ps.urlPreviewAllowRedirect !== undefined) {
				set.urlPreviewAllowRedirect = ps.urlPreviewAllowRedirect;
			}

			if (ps.urlPreviewTimeout !== undefined) {
				set.urlPreviewTimeout = ps.urlPreviewTimeout;
			}

			if (ps.urlPreviewMaximumContentLength !== undefined) {
				set.urlPreviewMaximumContentLength = ps.urlPreviewMaximumContentLength;
			}

			if (ps.urlPreviewRequireContentLength !== undefined) {
				set.urlPreviewRequireContentLength = ps.urlPreviewRequireContentLength;
			}

			if (ps.urlPreviewUserAgent !== undefined) {
				const value = (ps.urlPreviewUserAgent ?? '').trim();
				set.urlPreviewUserAgent = value === '' ? null : ps.urlPreviewUserAgent;
			}

			if (ps.summalyProxy !== undefined || ps.urlPreviewSummaryProxyUrl !== undefined) {
				const value = ((ps.urlPreviewSummaryProxyUrl ?? ps.summalyProxy) ?? '').trim();
				set.urlPreviewSummaryProxyUrl = value === '' ? null : value;
			}

			if (Array.isArray(ps.urlPreviewSensitiveList)) {
				set.urlPreviewSensitiveList = ps.urlPreviewSensitiveList.filter(Boolean);
			}

			if (ps.federation !== undefined) {
				set.federation = ps.federation;
			}

			if (ps.deliverSuspendedSoftware !== undefined) {
				set.deliverSuspendedSoftware = ps.deliverSuspendedSoftware;
			}

			if (Array.isArray(ps.federationHosts)) {
				set.federationHosts = ps.federationHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (ps.singleUserMode !== undefined) {
				set.singleUserMode = ps.singleUserMode;
			}

			if (ps.ugcVisibilityForVisitor !== undefined) {
				set.ugcVisibilityForVisitor = ps.ugcVisibilityForVisitor;
			}

			if (ps.proxyRemoteFiles !== undefined) {
				set.proxyRemoteFiles = ps.proxyRemoteFiles;
			}

			if (ps.signToActivityPubGet !== undefined) {
				set.signToActivityPubGet = ps.signToActivityPubGet;
			}

			if (ps.allowExternalApRedirect !== undefined) {
				set.allowExternalApRedirect = ps.allowExternalApRedirect;
			}

			if (ps.enableRemoteNotesCleaning !== undefined) {
				set.enableRemoteNotesCleaning = ps.enableRemoteNotesCleaning;
			}

			if (ps.remoteNotesCleaningExpiryDaysForEachNotes !== undefined) {
				set.remoteNotesCleaningExpiryDaysForEachNotes = ps.remoteNotesCleaningExpiryDaysForEachNotes;
			}

			if (ps.remoteNotesCleaningMaxProcessingDurationInMinutes !== undefined) {
				set.remoteNotesCleaningMaxProcessingDurationInMinutes = ps.remoteNotesCleaningMaxProcessingDurationInMinutes;
			}

			if (ps.showRoleBadgesOfRemoteUsers !== undefined) {
				set.showRoleBadgesOfRemoteUsers = ps.showRoleBadgesOfRemoteUsers;
			}

			// tempura: フォーク独自の設定

			if (ps.enableLongIconUrl !== undefined) {
				set.enableLongIconUrl = ps.enableLongIconUrl;
			}

			if (ps.longIconUrl !== undefined) {
				set.longIconUrl = ps.longIconUrl;
			}

			if (ps.youBlockedImageUrl !== undefined) {
				set.youBlockedImageUrl = ps.youBlockedImageUrl;
			}

			if (ps.backgroundImageUrls !== undefined) {
				set.backgroundImageUrls = ps.backgroundImageUrls ?? [];
			}

			if (ps.approvalRequiredForSignup !== undefined) {
				set.approvalRequiredForSignup = ps.approvalRequiredForSignup;
			}

			if (ps.defaultRequireSigninToViewContents !== undefined) {
				set.defaultRequireSigninToViewContents = ps.defaultRequireSigninToViewContents;
			}

			if (ps.openLlmModerationEnabled !== undefined) {
				set.openLlmModerationEnabled = ps.openLlmModerationEnabled;
			}

			if (ps.openLlmModerationApiKey !== undefined) {
				if (ps.openLlmModerationApiKey === '') {
					set.openLlmModerationApiKey = null;
				} else {
					set.openLlmModerationApiKey = ps.openLlmModerationApiKey;
				}
			}

			if (ps.openLlmModerationIncludeRemote !== undefined) {
				set.openLlmModerationIncludeRemote = ps.openLlmModerationIncludeRemote;
			}

			if (ps.openLlmModerationVisibilities !== undefined) {
				set.openLlmModerationVisibilities = ps.openLlmModerationVisibilities;
			}

			if (ps.openLlmModerationApiUrl !== undefined) {
				const trimmed = ps.openLlmModerationApiUrl?.trim() ?? '';
				set.openLlmModerationApiUrl = trimmed === '' ? null : trimmed;
			}

			if (ps.openLlmModerationModel !== undefined) {
				const trimmed = ps.openLlmModerationModel?.trim() ?? '';
				set.openLlmModerationModel = trimmed === '' ? null : trimmed;
			}

			if (ps.objectStoragePrefixForRemote !== undefined) {
				set.objectStoragePrefixForRemote = ps.objectStoragePrefixForRemote;
			}

			if (ps.objectStorageCacheDays !== undefined) {
				set.objectStorageCacheDays = ps.objectStorageCacheDays;
			}

			if (ps.enableLoginRiskDetection !== undefined) {
				set.enableLoginRiskDetection = ps.enableLoginRiskDetection;
			}

			if (ps.loginRiskNotifyThreshold !== undefined) {
				set.loginRiskNotifyThreshold = ps.loginRiskNotifyThreshold;
			}

			if (ps.loginRiskStepUpThreshold !== undefined) {
				set.loginRiskStepUpThreshold = ps.loginRiskStepUpThreshold;
			}

			if (ps.loginRiskNotifyThreshold !== undefined || ps.loginRiskStepUpThreshold !== undefined) {
				const notify = set.loginRiskNotifyThreshold ?? this.serverSettings.loginRiskNotifyThreshold;
				const stepUp = set.loginRiskStepUpThreshold ?? this.serverSettings.loginRiskStepUpThreshold;
				if (notify >= stepUp) {
					throw new ApiError(meta.errors.invalidLoginRiskThresholds);
				}
			}

			if (ps.loginRiskFlagUnverifiedUsers !== undefined) {
				set.loginRiskFlagUnverifiedUsers = ps.loginRiskFlagUnverifiedUsers;
			}

			if (ps.loginRiskShowDetailsToUser !== undefined) {
				set.loginRiskShowDetailsToUser = ps.loginRiskShowDetailsToUser;
			}

			if (ps.emailWhitelist !== undefined) {
				set.emailWhitelist = ps.emailWhitelist;
			}

			if (ps.requireSignedApFetch !== undefined) {
				set.requireSignedApFetch = ps.requireSignedApFetch;
			}

			if (ps.allowUnregisteredApSignerVerification !== undefined) {
				set.allowUnregisteredApSignerVerification = ps.allowUnregisteredApSignerVerification;
			}

			if (ps.proxyAccountFollowMode !== undefined) {
				set.proxyAccountFollowMode = ps.proxyAccountFollowMode;
			}

			if (ps.allowAnonymousStats !== undefined) {
				set.allowAnonymousStats = ps.allowAnonymousStats;
			}

			if (ps.allowAnonymousOnlineUsersCount !== undefined) {
				set.allowAnonymousOnlineUsersCount = ps.allowAnonymousOnlineUsersCount;
			}

			if (ps.allowAnonymousChartActiveUsers !== undefined) {
				set.allowAnonymousChartActiveUsers = ps.allowAnonymousChartActiveUsers;
			}

			if (ps.allowAnonymousChartApRequest !== undefined) {
				set.allowAnonymousChartApRequest = ps.allowAnonymousChartApRequest;
			}

			if (ps.allowAnonymousChartDrive !== undefined) {
				set.allowAnonymousChartDrive = ps.allowAnonymousChartDrive;
			}

			if (ps.allowAnonymousChartFederation !== undefined) {
				set.allowAnonymousChartFederation = ps.allowAnonymousChartFederation;
			}

			if (ps.allowAnonymousChartInstance !== undefined) {
				set.allowAnonymousChartInstance = ps.allowAnonymousChartInstance;
			}

			if (ps.allowAnonymousChartNotes !== undefined) {
				set.allowAnonymousChartNotes = ps.allowAnonymousChartNotes;
			}

			if (ps.allowAnonymousChartUsers !== undefined) {
				set.allowAnonymousChartUsers = ps.allowAnonymousChartUsers;
			}

			if (ps.allowAnonymousFederationUsers !== undefined) {
				set.allowAnonymousFederationUsers = ps.allowAnonymousFederationUsers;
			}

			if (ps.allowAnonymousFederationStats !== undefined) {
				set.allowAnonymousFederationStats = ps.allowAnonymousFederationStats;
			}

			if (ps.allowAnonymousShowInstance !== undefined) {
				set.allowAnonymousShowInstance = ps.allowAnonymousShowInstance;
			}

			if (ps.allowAnonymousReplies !== undefined) {
				set.allowAnonymousReplies = ps.allowAnonymousReplies;
			}

			if (ps.allowAnonymousRenotes !== undefined) {
				set.allowAnonymousRenotes = ps.allowAnonymousRenotes;
			}

			if (ps.allowAnonymousQuotes !== undefined) {
				set.allowAnonymousQuotes = ps.allowAnonymousQuotes;
			}

			if (ps.allowAnonymousFederationInstances !== undefined) {
				set.allowAnonymousFederationInstances = ps.allowAnonymousFederationInstances;
			}

			if (ps.allowAnonymousFeatured !== undefined) {
				set.allowAnonymousFeatured = ps.allowAnonymousFeatured;
			}

			if (ps.allowAnonymousLocalTimeline !== undefined) {
				set.allowAnonymousLocalTimeline = ps.allowAnonymousLocalTimeline;
			}

			if (ps.allowAnonymousReactions !== undefined) {
				set.allowAnonymousReactions = ps.allowAnonymousReactions;
			}

			if (Array.isArray(ps.customSplashText)) {
				set.customSplashText = ps.customSplashText.filter(Boolean);
			}

			if (ps.offlinePageConfig !== undefined) {
				set.offlinePageConfig = ps.offlinePageConfig;
			}

			if (ps.mediaProxy !== undefined) {
				if (ps.mediaProxy == null || ps.mediaProxy.trim() === '') {
					set.mediaProxy = null;
				} else {
					const classification = classifyMediaProxyUrl(ps.mediaProxy, this.config.url);
					// 自サーバーの /proxy 配下 (リダイレクトループ) とルートオリジン (プロキシルートが無く 404) は拒否する
					if (classification.kind !== 'external') {
						throw new ApiError(meta.errors.invalidMediaProxyUrl);
					}
					set.mediaProxy = classification.url;
				}
			}

			if (ps.blockMentionsFromUnfamiliarRemoteUsers !== undefined) {
				set.blockMentionsFromUnfamiliarRemoteUsers = ps.blockMentionsFromUnfamiliarRemoteUsers;
			}

			if (ps.validateMinimumUsernameLength !== undefined) {
				set.validateMinimumUsernameLength = ps.validateMinimumUsernameLength;
			}

			if (ps.useHanaEntrance !== undefined) {
				set.useHanaEntrance = ps.useHanaEntrance;
			}

			if (ps.hanaThemeColor !== undefined) {
				set.hanaThemeColor = ps.hanaThemeColor;
			}

			if (ps.hanaThemeAltColor !== undefined) {
				set.hanaThemeAltColor = ps.hanaThemeAltColor;
			}

			if (ps.hanaThemeWeakOpacity !== undefined) {
				set.hanaThemeWeakOpacity = ps.hanaThemeWeakOpacity;
			}

			if (ps.hanaModeIcon !== undefined) {
				set.hanaModeIcon = ps.hanaModeIcon;
			}

			if (ps.hanaModeIconSize !== undefined) {
				set.hanaModeIconSize = ps.hanaModeIconSize;
			}

			if (ps.hanaModeIconRadius !== undefined) {
				set.hanaModeIconRadius = ps.hanaModeIconRadius;
			}

			if (ps.hanaModeBackground !== undefined) {
				set.hanaModeBackground = ps.hanaModeBackground;
			}

			if (Array.isArray(ps.defaultFollowedUsers)) {
				if (ps.defaultFollowedUsers.some(x => this.serverSettings.forciblyFollowedUsers.includes(x) || ps.forciblyFollowedUsers?.includes(x))) {
					throw new ApiError(meta.errors.followedUserDuplicated);
				}

				set.defaultFollowedUsers = ps.defaultFollowedUsers.filter(Boolean);
			}

			if (Array.isArray(ps.forciblyFollowedUsers)) {
				if (ps.forciblyFollowedUsers.some(x => this.serverSettings.defaultFollowedUsers.includes(x) || ps.defaultFollowedUsers?.includes(x))) {
					throw new ApiError(meta.errors.followedUserDuplicated);
				}

				set.forciblyFollowedUsers = ps.forciblyFollowedUsers.filter(Boolean);
			}

			if (ps.deeplFreeMode !== undefined) {
				set.deeplFreeMode = ps.deeplFreeMode;
			}

			if (ps.deeplFreeInstance !== undefined) {
				if (ps.deeplFreeInstance === '') {
					set.deeplFreeInstance = null;
				} else {
					set.deeplFreeInstance = ps.deeplFreeInstance;
				}
			}

			if (ps.enableCpuModel !== undefined) {
				set.enableCpuModel = ps.enableCpuModel;
			}

			if (ps.customCpuModel !== undefined) {
				set.customCpuModel = ps.customCpuModel;
			}

			if (ps.enableCpuCore !== undefined) {
				set.enableCpuCore = ps.enableCpuCore;
			}

			if (ps.customCpuCore !== undefined) {
				set.customCpuCore = ps.customCpuCore;
			}

			if (ps.enableMemTotal !== undefined) {
				set.enableMemTotal = ps.enableMemTotal;
			}

			if (ps.customMemTotal !== undefined) {
				set.customMemTotal = ps.customMemTotal;
			}

			if (ps.enableFsTotal !== undefined) {
				set.enableFsTotal = ps.enableFsTotal;
			}

			if (ps.customFsTotal !== undefined) {
				set.customFsTotal = ps.customFsTotal;
			}

			if (ps.secondsPerSignup !== undefined) {
				set.secondsPerSignup = ps.secondsPerSignup;
			}

			if (ps.fixedInviteCode !== undefined) {
				// 招待コードの入力欄は前後の空白を除いて照合するため、保存時にも除いておく
				const fixedInviteCode = ps.fixedInviteCode?.trim() ?? null;
				set.fixedInviteCode = fixedInviteCode === '' ? null : fixedInviteCode;
			}

			if (ps.signupPassphrase !== undefined) {
				// 正規化して空になる合言葉 (空白のみ等) は無効扱いにする
				set.signupPassphrase = (ps.signupPassphrase != null && normalizeSignupPassphrase(ps.signupPassphrase) === '')
					? null
					: ps.signupPassphrase;
			}

			if (ps.entranceShowTimeLine !== undefined) {
				set.entranceShowTimeLine = ps.entranceShowTimeLine;
			}

			if (ps.entranceShowFeatured !== undefined) {
				set.entranceShowFeatured = ps.entranceShowFeatured;
			}

			if (ps.entranceShowEmojis !== undefined) {
				set.entranceShowEmojis = ps.entranceShowEmojis;
			}

			if (Array.isArray(ps.entranceSelectEmojis)) {
				set.entranceSelectEmojis = ps.entranceSelectEmojis;
			}

			if (ps.entranceShowStats !== undefined) {
				set.entranceShowStats = ps.entranceShowStats;
			}

			if (ps.entranceShowFederation !== undefined) {
				set.entranceShowFederation = ps.entranceShowFederation;
			}

			if (ps.entranceShowDashboard !== undefined) {
				set.entranceShowDashboard = ps.entranceShowDashboard;
			}

			if (ps.entranceShowSignup !== undefined) {
				set.entranceShowSignup = ps.entranceShowSignup;
			}

			if (ps.entranceShowAnotherInstance !== undefined) {
				set.entranceShowAnotherInstance = ps.entranceShowAnotherInstance;
			}

			if (ps.entranceShowSignin !== undefined) {
				set.entranceShowSignin = ps.entranceShowSignin;
			}

			if (ps.entranceMarginLeft !== undefined) {
				set.entranceMarginLeft = ps.entranceMarginLeft;
			}

			if (ps.entranceMarginRight !== undefined) {
				set.entranceMarginRight = ps.entranceMarginRight;
			}

			if (ps.entranceMarginTop !== undefined) {
				set.entranceMarginTop = ps.entranceMarginTop;
			}

			if (ps.entranceMarginBottom !== undefined) {
				set.entranceMarginBottom = ps.entranceMarginBottom;
			}

			if (ps.serverOpenAIEnabled !== undefined) {
				set.serverOpenAIEnabled = ps.serverOpenAIEnabled;
			}

			if (ps.serverOpenAIApiKey !== undefined) {
				set.serverOpenAIApiKey = ps.serverOpenAIApiKey;
			}

			if (ps.serverOpenAIBaseURL !== undefined) {
				set.serverOpenAIBaseURL = ps.serverOpenAIBaseURL;
			}

			if (ps.serverOpenAIModels !== undefined) {
				set.serverOpenAIModels = ps.serverOpenAIModels;
			}

			if (ps.customCursorUrl !== undefined) {
				set.customCursorUrl = ps.customCursorUrl;
			}

			if (ps.customCursorPointerUrl !== undefined) {
				set.customCursorPointerUrl = ps.customCursorPointerUrl;
			}

			if (ps.customCursorTextUrl !== undefined) {
				set.customCursorTextUrl = ps.customCursorTextUrl;
			}

			if (ps.customCursorProgressUrl !== undefined) {
				set.customCursorProgressUrl = ps.customCursorProgressUrl;
			}

			if (ps.customCursorWaitUrl !== undefined) {
				set.customCursorWaitUrl = ps.customCursorWaitUrl;
			}

			if (ps.enableContactForm !== undefined) {
				set.enableContactForm = ps.enableContactForm;
			}

			if (ps.contactFormLimit !== undefined) {
				set.contactFormLimit = ps.contactFormLimit;
			}

			if (ps.contactFormRequireAuth !== undefined) {
				set.contactFormRequireAuth = ps.contactFormRequireAuth;
			}

			if (ps.contactFormCategories !== undefined) {
				// Validate contactFormCategories array
				if (Array.isArray(ps.contactFormCategories)) {
					// Check for duplicate keys
					const keys = ps.contactFormCategories.map(cat => cat.key);
					const uniqueKeys = new Set(keys);
					if (keys.length !== uniqueKeys.size) {
						throw new Error('Duplicate category keys are not allowed');
					}

					// Check for multiple default categories
					const defaultCategories = ps.contactFormCategories.filter(cat => cat.isDefault);
					if (defaultCategories.length > 1) {
						throw new Error('Only one category can be set as default');
					}

					// Ensure at least one category exists and has a default
					if (ps.contactFormCategories.length > 0 && defaultCategories.length === 0) {
						throw new Error('At least one category must be set as default');
					}
				}

				set.contactFormCategories = ps.contactFormCategories;
			}

			const before = await this.metaService.fetch(true);

			await this.metaService.update(set);

			const after = await this.metaService.fetch(true);

			this.moderationLogService.log(me, 'updateServerSettings', {
				before,
				after,
			});

			// 無効から有効に切り替えたら、03:30 を待たずにデータを取得する。失敗しても設定の更新は成功させる
			if (!before.enableLoginRiskDetection && after.enableLoginRiskDetection) {
				try {
					await this.queueService.systemQueue.add('updateIpIntelligence', {}, {
						jobId: 'updateIpIntelligence-oneshot',
						removeOnComplete: true,
						removeOnFail: true,
					});
				} catch (err) {
					this.apiLoggerService.logger.warn(`failed to enqueue the IP intelligence update: ${err}`);
				}
			}
			// メディアプロキシの実効値が変わったら、DB に保存済みの avatarUrl / bannerUrl を新しい実効値へ収束させる。
			// 同じ値で明示的に保存された場合も再実行する (失敗や取り残しを管理画面から復旧できるようにするため)。
			if (ps.mediaProxy !== undefined) {
				const requestedMediaProxy = resolveMediaProxy(this.config, after).mediaProxy;
				const beforeMediaProxy = resolveMediaProxy(this.config, before).mediaProxy;
				// 設定値が実際に変わった場合は旧接頭辞の行だけを対象にし、無関係な配信元 URL を巻き込まない。
				// 同じ値の再保存は「再同期」とみなし、プロキシ形式の URL すべてを現在値へ寄せる。
				const fromMediaProxy = beforeMediaProxy !== requestedMediaProxy ? beforeMediaProxy : null;
				this.enqueueMediaProxyReconcile(requestedMediaProxy, fromMediaProxy, 0);
			}
		});
	}

	/** プロセス内で直列化しつつ、保存済みの画像URLを実効プロキシへ収束させる */
	private enqueueMediaProxyReconcile(target: string, fromMediaProxy: string | null, depth: number): void {
		this.rewriteChain = this.rewriteChain
			.then(async () => {
				const latest = await this.metaService.fetch(true);
				const latestMediaProxy = resolveMediaProxy(this.config, latest).mediaProxy;
				// 実行時点で実効値が変わっていたら、その要求は古いので何もしない (後勝ちを上書きしない)
				if (latestMediaProxy !== target) return;

				const result = await reconcileUserMediaProxyUrls(this.usersRepository, latestMediaProxy, { fromMediaProxy });
				if (result.rewritten > 0) {
					// 全プロセスのユーザーキャッシュを一括で無効化する (per-user イベントは DB 負荷が行数×プロセス数になるため避ける)
					this.globalEventService.publishInternalEvent('userMediaProxyRewritten', { newMediaProxy: latestMediaProxy });
				}
				if (result.skippedByOrigin > 0 || result.skippedByLength > 0 || result.remainingForeignProxy > 0) {
					this.apiLoggerService.logger.warn(
						`mediaProxy URL reconcile: rewritten=${result.rewritten}, skippedByOrigin=${result.skippedByOrigin}, skippedByLength=${result.skippedByLength}, remainingForeignProxy=${result.remainingForeignProxy}. ` +
						'skippedByLength の行は短いプロキシURLに変更するまで対象外、skippedByOrigin の行はオリジン配信が必要なため常に対象外、' +
						'remainingForeignProxy の行は別のプロキシ接頭辞のまま残っているため「保存済みの画像URLを再同期」で回収できます。',
					);
				}

				// 直列化はプロセス内のみなので、別プロセスが後から値を変えていたら追いかけてもう一度収束させる
				if (depth < 3) {
					const now = await this.metaService.fetch(true);
					const nowMediaProxy = resolveMediaProxy(this.config, now).mediaProxy;
					if (nowMediaProxy !== latestMediaProxy) {
						// 追従時も直前の実効値を対象に限定する (無関係な ?url= 付き URL を巻き込まない)
						this.enqueueMediaProxyReconcile(nowMediaProxy, latestMediaProxy, depth + 1);
					}
				}
			})
			.catch((err) => {
				this.apiLoggerService.logger.warn(`failed to reconcile stored user mediaProxy URLs: ${err}`);
			});
	}
}
