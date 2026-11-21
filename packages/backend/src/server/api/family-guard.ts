/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Sub-account family guard declarations.
 *
 * A sub-account (users.parentUserId != null) must not be able to lock out or
 * wreck its parent or sibling sub-accounts through admin/moderator operations.
 * Only endpoints that can lock the parent out declare it, with the endpoint meta keys
 * `denyForSubAccount`, `protectFamily` and `protectFamilyRule` (see FamilyGuardService).
 * This is separate from `secure` (which limits an endpoint to the native token).
 */

export type FamilyTargetSpec = {
	/** request parameter that holds the target user id */
	readonly param: string;
	/** the parameter is an array of user ids */
	readonly array?: boolean;
	/** also refuse when the actor targets itself (sub-accounts cannot do this to themselves) */
	readonly denySelf?: boolean;
};

export type FamilyRule = 'role-definition' | 'server-settings';

export const UPDATE_META_SUB_DENIED_KEYS = [
	'disableRegistration',
	'subAccountCreationMode',
	'prohibitedWordsForNameOfUser',
	'emailRequiredForSignup',
	'enableHcaptcha',
	'hcaptchaSiteKey',
	'hcaptchaSecretKey',
	'enableMcaptcha',
	'mcaptchaSiteKey',
	'mcaptchaInstanceUrl',
	'mcaptchaSecretKey',
	'enableRecaptcha',
	'recaptchaSiteKey',
	'recaptchaSecretKey',
	'enableTurnstile',
	'turnstileSiteKey',
	'turnstileSecretKey',
	'enableTestcaptcha',
	'enableEmail',
	'email',
	'smtpSecure',
	'smtpHost',
	'smtpPort',
	'smtpUser',
	'smtpPass',
	'enableActiveEmailValidation',
	'enableVerifymailApi',
	'verifymailAuthKey',
	'enableTruemailApi',
	'truemailInstance',
	'truemailAuthKey',
	'bannedEmailDomains',
	'preservedUsernames',
	'singleUserMode',
	'ugcVisibilityForVisitor',
	'approvalRequiredForSignup',
	'enableLoginRiskDetection',
	'loginRiskNotifyThreshold',
	'loginRiskStepUpThreshold',
	'loginRiskFlagUnverifiedUsers',
	'loginRiskShowDetailsToUser',
	'emailWhitelist',
	'validateMinimumUsernameLength',
	'useHanaEntrance',
	'secondsPerSignup',
	'entranceShowSignup',
	'entranceShowSignin',
	'contactFormRequireAuth',
	'useObjectStorage',
	'objectStorageBaseUrl',
	'objectStorageBucket',
	'objectStoragePrefix',
	'objectStorageEndpoint',
	'objectStorageRegion',
	'objectStoragePort',
	'objectStorageAccessKey',
	'objectStorageSecretKey',
	'objectStorageUseSSL',
	'objectStorageUseProxy',
	'objectStorageSetPublicRead',
	'objectStorageS3ForcePathStyle',
	'objectStoragePrefixForRemote',
	'enableServiceWorker',
	'swPublicKey',
	'swPrivateKey',
	'manifestJsonOverride',
	'federation',
	'federationHosts',
	'signToActivityPubGet',
	'requireSignedApFetch',
	'allowUnregisteredApSignerVerification',
	'allowExternalApRedirect',
	'proxyRemoteFiles',
	'deliverSuspendedSoftware',
	'openLlmModerationEnabled',
	'openLlmModerationApiKey',
	'openLlmModerationIncludeRemote',
	'openLlmModerationVisibilities',
	'openLlmModerationApiUrl',
	'openLlmModerationModel',
	'sensitiveMediaDetectionApiUrl',
	'sensitiveMediaDetectionApiKey',
	'deeplAuthKey',
	'deeplIsPro',
	'deeplFreeMode',
	'deeplFreeInstance',
	'serverGeminiApiKey',
	'summalyProxy',
	'urlPreviewSummaryProxyUrl',
	'enableIpLogging',
] as const;

/** update-meta keys that sub-accounts may NOT change: sign-in, registration and access settings (they affect every account, including the root). */
export type UpdateMetaSubDeniedKey = typeof UPDATE_META_SUB_DENIED_KEYS[number];
