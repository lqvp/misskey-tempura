/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedMetaLiteSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		maintainerName: {
			type: 'string',
			optional: false, nullable: true,
		},
		maintainerEmail: {
			type: 'string',
			optional: false, nullable: true,
		},
		version: {
			type: 'string',
			optional: false, nullable: false,
		},
		providesTarball: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		name: {
			type: 'string',
			optional: false, nullable: true,
		},
		shortName: {
			type: 'string',
			optional: false, nullable: true,
		},
		uri: {
			type: 'string',
			optional: false, nullable: false,
			format: 'url',
			example: 'https://misskey.example.com',
		},
		description: {
			type: 'string',
			optional: false, nullable: true,
		},
		langs: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
		tosUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		repositoryUrl: {
			type: 'string',
			optional: false, nullable: true,
			default: 'https://github.com/lqvp/misskey-tempura',
		},
		feedbackUrl: {
			type: 'string',
			optional: false, nullable: true,
			default: 'https://github.com/lqvp/misskey-tempura/issues/new',
		},
		defaultDarkTheme: {
			type: 'string',
			optional: false, nullable: true,
		},
		defaultLightTheme: {
			type: 'string',
			optional: false, nullable: true,
		},
		disableRegistration: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		emailRequiredForSignup: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		approvalRequiredForSignup: {
			type: 'boolean',
			optional: false, default: false,
		},
		enableHcaptcha: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		hcaptchaSiteKey: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableMcaptcha: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		mcaptchaSiteKey: {
			type: 'string',
			optional: false, nullable: true,
		},
		mcaptchaInstanceUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableRecaptcha: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		recaptchaSiteKey: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableTurnstile: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		turnstileSiteKey: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableTestcaptcha: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		googleAnalyticsMeasurementId: {
			type: 'string',
			optional: false, nullable: true,
		},
		swPublickey: {
			type: 'string',
			optional: false, nullable: true,
		},
		mascotImageUrl: {
			type: 'string',
			optional: false, nullable: false,
			default: '/assets/ai.png',
		},
		bannerUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		serverErrorImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		infoImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		notFoundImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		youBlockedImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		iconUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableLongIconUrl: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		longIconUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		maxNoteTextLength: {
			type: 'number',
			optional: false, nullable: false,
		},
		ads: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
						example: 'xxxxxxxxxx',
					},
					url: {
						type: 'string',
						optional: false, nullable: false,
						format: 'url',
					},
					place: {
						type: 'string',
						optional: false, nullable: false,
					},
					ratio: {
						type: 'number',
						optional: false, nullable: false,
					},
					imageUrl: {
						type: 'string',
						optional: false, nullable: false,
						format: 'url',
					},
					dayOfWeek: {
						type: 'integer',
						optional: false, nullable: false,
					},
				},
			},
		},
		notesPerOneAd: {
			type: 'number',
			optional: false, nullable: false,
			default: 0,
		},
		enableEmail: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		enableServiceWorker: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		translatorAvailable: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		sentryForFrontend: {
			type: 'object',
			optional: false, nullable: true,
			properties: {
				options: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						dsn: {
							type: 'string',
							optional: false, nullable: false,
						},
					},
					additionalProperties: true,
				},
				vueIntegration: {
					type: 'object',
					optional: true, nullable: true,
					additionalProperties: true,
				},
				browserTracingIntegration: {
					type: 'object',
					optional: true, nullable: true,
					additionalProperties: true,
				},
				replayIntegration: {
					type: 'object',
					optional: true, nullable: true,
					additionalProperties: true,
				},
			},
		},
		mediaProxy: {
			type: 'string',
			optional: false, nullable: false,
		},
		enableUrlPreview: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		backgroundImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		backgroundImageUrls: {
			type: 'array',
			optional: false,
			nullable: false,
			items: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					url: {
						type: 'string',
						optional: false,
						nullable: false,
					},
				},
			},
		},
		impressumUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		logoImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		privacyPolicyUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		inquiryUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		serverRules: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'string',
			},
		},
		themeColor: {
			type: 'string',
			optional: false, nullable: true,
		},
		policies: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'RolePolicies',
		},
		noteSearchableScope: {
			type: 'string',
			enum: ['local', 'global'],
			optional: false, nullable: false,
			default: 'local',
		},
		maxFileSize: {
			type: 'number',
			optional: false, nullable: false,
		},
		federation: {
			type: 'string',
			enum: ['all', 'specified', 'none'],
			optional: false, nullable: false,
		},
		useHanaEntrance: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		hanaThemeColor: {
			type: 'string',
			optional: false, nullable: false,
			default: '#fd709a',
		},
		hanaThemeAltColor: {
			type: 'string',
			optional: false, nullable: false,
			default: '#f77062',
		},
		hanaThemeWeakOpacity: {
			type: 'number',
			optional: false, nullable: false,
			default: 0.2,
		},
		hanaModeIcon: {
			type: 'string',
			optional: true, nullable: true,
		},
		hanaModeIconSize: {
			type: 'number',
			optional: false, nullable: false,
			default: 128,
		},
		hanaModeIconRadius: {
			type: 'number',
			optional: false, nullable: false,
			default: 50,
		},
		hanaModeBackground: {
			type: 'string',
			optional: true, nullable: true,
		},
		enableSignupRateLimit: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		entranceShowTimeLine: {
			type: 'boolean',
			optional: false, nullable: false,
			default: false,
		},
		entranceShowFeatured: {
			type: 'boolean',
			optional: false, nullable: false,
			default: false,
		},
		entranceShowEmojis: {
			type: 'boolean',
			optional: false, nullable: false,
			default: false,
		},
		entranceSelectEmojis: {
			type: 'array',
			optional: false, nullable: false,
			default: ['👍', '❤', '😆', '🎉', '🍮'],
			items: {
				type: 'string',
			},
		},
		entranceShowStats: {
			type: 'boolean',
			optional: false, nullable: false,
			default: false,
		},
		entranceShowFederation: {
			type: 'boolean',
			optional: false, nullable: false,
			default: false,
		},
		entranceShowDashboard: {
			type: 'boolean',
			optional: false, nullable: false,
			default: true,
		},
		entranceShowSignup: {
			type: 'boolean',
			optional: false, nullable: false,
			default: true,
		},
		entranceShowAnotherInstance: {
			type: 'boolean',
			optional: false, nullable: false,
			default: true,
		},
		entranceShowSignin: {
			type: 'boolean',
			optional: false, nullable: false,
			default: true,
		},
		entranceMarginLeft: {
			type: 'number',
			optional: false, nullable: false,
			default: 120,
		},
		entranceMarginRight: {
			type: 'number',
			optional: false, nullable: false,
			default: 0,
		},
		entranceMarginTop: {
			type: 'number',
			optional: false, nullable: false,
			default: 0,
		},
		entranceMarginBottom: {
			type: 'number',
			optional: false, nullable: false,
			default: 0,
		},
		serverGeminiEnabled: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		customCursorUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		customCursorPointerUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		customCursorTextUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		customCursorProgressUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		customCursorWaitUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		enableContactForm: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		contactFormLimit: {
			type: 'number',
			optional: false, nullable: false,
		},
		contactFormRequireAuth: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		contactFormCategories: {
			type: 'array',
			optional: false, nullable: false,
		},
	},
} as const;

export const packedMetaDetailedOnlySchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		features: {
			type: 'object',
			optional: true, nullable: false,
			properties: {
				registration: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				emailRequiredForSignup: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				localTimeline: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				globalTimeline: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				hcaptcha: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				turnstile: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				recaptcha: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				objectStorage: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				serviceWorker: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				miauth: {
					type: 'boolean',
					optional: true, nullable: false,
					default: true,
				},
			},
		},
		proxyAccountName: {
			type: 'string',
			optional: false, nullable: true,
		},
		requireSetup: {
			type: 'boolean',
			optional: false, nullable: false,
			example: false,
		},
		cacheRemoteFiles: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		cacheRemoteSensitiveFiles: {
			type: 'boolean',
			optional: false, nullable: false,
		},
	},
} as const;

export const packedMetaDetailedSchema = {
	type: 'object',
	allOf: [
		{
			type: 'object',
			ref: 'MetaLite',
		},
		{
			type: 'object',
			ref: 'MetaDetailedOnly',
		},
	],
} as const;
