/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export interface ContactFormCategory {
	key: string; // カテゴリキー (例: 'bug_report', 'feature_request')
	text: string; // 表示テキスト (例: 'バグ報告', 'Bug Report')
	enabled: boolean; // 有効/無効フラグ
	order: number; // 表示順序
	isDefault: boolean; // デフォルトカテゴリフラグ
}

@Entity('meta')
export class MiMeta {
	@PrimaryColumn({
		type: 'varchar',
		length: 32,
	})
	public id: string;

	@Column({
		...id(),
		nullable: true,
	})
	public rootUserId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	public rootUser: MiUser | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public shortName: string | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public description: string | null;

	/**
	 * メンテナの名前
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerEmail: string | null;

	@Column('boolean', {
		default: false,
	})
	public disableRegistration: boolean;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public langs: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public pinnedUsers: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public hiddenTags: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public blockedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public sensitiveWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWordsForNameOfUser: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public silencedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public mediaSilencedHosts: string[];

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public themeColor: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mascotImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public backgroundImageUrl: string | null;

	@Column('jsonb', {
		default: [],
		nullable: true,
	})
	public backgroundImageUrls: { url: string }[];

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public logoImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableLongIconUrl: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public longIconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app192IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app512IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public serverErrorImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public notFoundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public infoImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public youBlockedImageUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public cacheRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public cacheRemoteSensitiveFiles: boolean;

	@Column('boolean', {
		default: false,
	})
	public emailRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public approvalRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableHcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableMcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSitekey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSecretKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaInstanceUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableRecaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTurnstile: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTestcaptcha: boolean;

	// chaptcha系を追加した際にはnodeinfoのレスポンスに追加するのを忘れないようにすること

	@Column('enum', {
		enum: ['none', 'all', 'local', 'remote'],
		default: 'none',
	})
	public sensitiveMediaDetection: 'none' | 'all' | 'local' | 'remote';

	@Column('enum', {
		enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
		default: 'medium',
	})
	public sensitiveMediaDetectionSensitivity: 'medium' | 'low' | 'high' | 'veryLow' | 'veryHigh';

	@Column('boolean', {
		default: false,
	})
	public setSensitiveFlagAutomatically: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableSensitiveMediaDetectionForVideos: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableEmail: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public email: string | null;

	@Column('boolean', {
		default: false,
	})
	public smtpSecure: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpHost: string | null;

	@Column('integer', {
		nullable: true,
	})
	public smtpPort: number | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpUser: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpPass: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableServiceWorker: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPublicKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPrivateKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public deeplIsPro: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public termsOfServiceUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/lqvp/misskey-tempura',
		nullable: true,
	})
	public repositoryUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/lqvp/misskey-tempura/issues/new',
		nullable: true,
	})
	public feedbackUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public impressumUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public privacyPolicyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public inquiryUrl: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultLightTheme: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultDarkTheme: string | null;

	@Column('boolean', {
		default: false,
	})
	public useObjectStorage: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBucket: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStoragePrefix: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStoragePrefixForRemote: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBaseUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageEndpoint: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageRegion: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageAccessKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageSecretKey: string | null;

	@Column('integer', {
		nullable: true,
	})
	public objectStoragePort: number | null;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseSSL: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseProxy: boolean;

	@Column('boolean', {
		default: false,
	})
	public objectStorageSetPublicRead: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageS3ForcePathStyle: boolean;

	@Column('integer', {
		nullable: true,
	})
	public objectStorageCacheDays: number | null;

	@Column('boolean', {
		default: false,
	})
	public enableIpLogging: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableActiveEmailValidation: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableVerifymailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public verifymailAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTruemailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailAuthKey: string | null;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForRemoteUser: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForFederatedInstances: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableStatsForFederatedInstances: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableServerMachineStats: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableIdenticonGeneration: boolean;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, any>;

	@Column('varchar', {
		length: 280,
		array: true,
		default: '{}',
	})
	public serverRules: string[];

	@Column('varchar', {
		length: 8192,
		default: '{}',
	})
	public manifestJsonOverride: string;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public bannedEmailDomains: string[];

	@Column('boolean', {
		default: false,
	})
	public emailWhitelist: boolean;

	@Column('varchar', {
		length: 1024, array: true, default: '{ "admin", "administrator", "root", "system", "maintainer", "host", "mod", "moderator", "owner", "superuser", "staff", "auth", "i", "me", "everyone", "all", "mention", "mentions", "example", "user", "users", "account", "accounts", "official", "help", "helps", "support", "supports", "info", "information", "informations", "announce", "announces", "announcement", "announcements", "notice", "notification", "notifications", "dev", "developer", "developers", "tech", "misskey" }',
	})
	public preservedUsernames: string[];

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimeline: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimelineDbFallback: boolean;

	@Column('integer', {
		default: 300,
	})
	public perLocalUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 100,
	})
	public perRemoteUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 300,
	})
	public perUserHomeTimelineCacheMax: number;

	@Column('integer', {
		default: 300,
	})
	public perUserListTimelineCacheMax: number;

	@Column('boolean', {
		default: false,
	})
	public enableReactionsBuffering: boolean;

	@Column('integer', {
		default: 0,
	})
	public notesPerOneAd: number;

	@Column('boolean', {
		default: true,
	})
	public urlPreviewEnabled: boolean;

	@Column('boolean', {
		default: true,
	})
	public urlPreviewAllowRedirect: boolean;

	@Column('integer', {
		default: 10000,
	})
	public urlPreviewTimeout: number;

	@Column('bigint', {
		default: 1024 * 1024 * 10,
	})
	public urlPreviewMaximumContentLength: number;

	@Column('boolean', {
		default: true,
	})
	public urlPreviewRequireContentLength: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewSummaryProxyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewUserAgent: string | null;

	@Column('varchar', {
		length: 128,
		default: 'all',
	})
	public federation: 'all' | 'specified' | 'none';

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public federationHosts: string[];

	@Column('varchar', {
		length: 128,
		default: 'local',
	})
	public ugcVisibilityForVisitor: 'all' | 'local' | 'none';

	@Column('varchar', {
		length: 64,
		nullable: true,
	})
	public googleAnalyticsMeasurementId: string | null;

	@Column('jsonb', {
		default: [],
	})
	public deliverSuspendedSoftware: SoftwareSuspension[];

	@Column('boolean', {
		default: false,
	})
	public singleUserMode: boolean;

	@Column('boolean', {
		default: true,
	})
	public proxyRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public signToActivityPubGet: boolean;

	@Column('boolean', {
		default: true,
	})
	public allowExternalApRedirect: boolean;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public customSplashText: string[];

	@Column('boolean', {
		default: true,
	})
	public blockMentionsFromUnfamiliarRemoteUsers: boolean;

	@Column('integer', {
		default: 5,
	})
	public validateMinimumUsernameLength: number;

	@Column('boolean', {
		default: false,
	})
	public useHanaEntrance: boolean;

	@Column('varchar', {
		length: 32,
		default: '#fd709a',
	})
	public hanaThemeColor: string;

	@Column('varchar', {
		length: 32,
		default: '#f77062',
	})
	public hanaThemeAltColor: string;

	@Column('float', {
		default: 0.2,
	})
	public hanaThemeWeakOpacity: number;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hanaModeIcon: string | null;

	@Column('integer', {
		default: 128,
	})
	public hanaModeIconSize: number;

	@Column('integer', {
		default: 50,
	})
	public hanaModeIconRadius: number;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hanaModeBackground: string | null;

	/**
	 * アカウント作成の段階でデフォルトでフォローしているユーザー（あとから解除可能）
	 */
	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public defaultFollowedUsers: string[];

	/**
	 * デフォルトでフォローしていて、フォロー解除・ブロック・ミュートができないユーザー
	 */
	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public forciblyFollowedUsers: string[];

	@Column('boolean', {
		default: false,
	})
	public deeplFreeMode: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplFreeInstance: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableCpuModel: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCpuModel: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableCpuCore: boolean;

	@Column('integer', {
		nullable: true,
	})
	public customCpuCore: number | null;

	@Column('boolean', {
		default: false,
	})
	public enableMemTotal: boolean;

	@Column('integer', {
		nullable: true,
	})
	public customMemTotal: number | null;

	@Column('boolean', {
		default: false,
	})
	public enableFsTotal: boolean;

	@Column('integer', {
		nullable: true,
	})
	public customFsTotal: number | null;

	@Column('integer', {
		default: 0,
	})
	public secondsPerSignup: number;

	@Column('boolean', {
		default: false,
	})
	public entranceShowTimeLine: boolean;

	@Column('boolean', {
		default: false,
	})
	public entranceShowFeatured: boolean;

	@Column('boolean', {
		default: false,
	})
	public entranceShowEmojis: boolean;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{ "👍", "❤", "😆", "🎉", "🍮" }',
	})
	public entranceSelectEmojis: string[];

	@Column('boolean', {
		default: false,
	})
	public entranceShowStats: boolean;

	@Column('boolean', {
		default: false,
	})
	public entranceShowFederation: boolean;

	@Column('boolean', {
		default: true,
	})
	public entranceShowDashboard: boolean;

	@Column('boolean', {
		default: true,
	})
	public entranceShowSignup: boolean;

	@Column('boolean', {
		default: true,
	})
	public entranceShowAnotherInstance: boolean;

	@Column('boolean', {
		default: true,
	})
	public entranceShowSignin: boolean;

	@Column('integer', {
		default: 120,
	})
	public entranceMarginLeft: number;

	@Column('integer', {
		default: 0,
	})
	public entranceMarginRight: number;

	@Column('integer', {
		default: 0,
	})
	public entranceMarginTop: number;

	@Column('integer', {
		default: 0,
	})
	public entranceMarginBottom: number;

	@Column('boolean', {
		default: false,
	})
	public serverGeminiEnabled: boolean;

	@Column('varchar', {
		length: 50,
		nullable: true,
	})
	public serverGeminiApiKey: string | null;

	@Column('varchar', {
		length: 50,
		default: 'gemini-2.0-flash',
		nullable: true,
	})
	public serverGeminiModels: string;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCursorUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCursorPointerUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCursorTextUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCursorProgressUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public customCursorWaitUrl: string | null;

	// Contact Form Settings
	@Column('boolean', {
		default: true,
	})
	public enableContactForm: boolean;

	@Column('integer', {
		default: 3,
	})
	public contactFormLimit: number;

	@Column('boolean', {
		default: false,
	})
	public contactFormRequireAuth: boolean;

	@Column('boolean', {
		default: true,
	})
	public contactFormRequireCaptcha: boolean;

	@Column('jsonb', {
		default: [],
	})
	public contactFormCategories: ContactFormCategory[];
}

export type SoftwareSuspension = {
	software: string;
	versionRange: string;
};
