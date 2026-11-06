/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { FamilyGuardService } from '@/core/FamilyGuardService.js';
import endpoints from '@/server/api/endpoints.js';
import { ApiError } from '@/server/api/error.js';
import { UPDATE_META_SUB_DENIED_KEYS } from '@/server/api/family-guard.js';

type U = { id: string; parentUserId: string | null };

const users: Record<string, U> = {
	main: { id: 'main', parentUserId: null },
	subA: { id: 'subA', parentUserId: 'main' },
	subB: { id: 'subB', parentUserId: 'main' },
	other: { id: 'other', parentUserId: null },
	otherSub: { id: 'otherSub', parentUserId: 'other' },
};

const roles: Record<string, { id: string; target: string; isPublic: boolean }> = {
	manualPrivate: { id: 'manualPrivate', target: 'manual', isPublic: false },
	manualPublic: { id: 'manualPublic', target: 'manual', isPublic: true },
	conditional: { id: 'conditional', target: 'conditional', isPublic: false },
	heldByFamily: { id: 'heldByFamily', target: 'manual', isPublic: false },
	heldBySelf: { id: 'heldBySelf', target: 'manual', isPublic: false },
};
const assignments: Record<string, string[]> = {
	heldByFamily: ['subB'],
	heldBySelf: ['subA'],
};

function createService() {
	const usersRepository = {
		findOne: async ({ where }: any) => users[where.id] ?? null,
		count: async ({ where }: any) => {
			const ids: string[] = where.id._value ?? where.id.value ?? [];
			return ids.filter(i => users[i]?.parentUserId === where.parentUserId).length;
		},
	};
	const rolesRepository = { findOneBy: async ({ id }: any) => roles[id] ?? null };
	const roleAssignmentsRepository = {
		find: async ({ where }: any) => (assignments[where.roleId] ?? []).map(userId => ({ userId })),
	};
	return new FamilyGuardService(usersRepository as never, rolesRepository as never, roleAssignmentsRepository as never);
}

type Meta = { denyForSubAccount?: boolean; protectFamily?: any[]; protectFamilyRule?: 'role-definition' | 'server-settings' };
const run = (s: FamilyGuardService, name: string, meta: Meta, actor: U | null, data: any) => s.assertAllowed(name, meta, actor, data);
const denied = async (p: Promise<void>) => {
	const e = await p.then(() => null, (err: unknown) => err);
	expect(e).toBeInstanceOf(ApiError);
	return e as ApiError;
};

describe('FamilyGuardService', () => {
	const s = createService();
	const g: Meta = { protectFamily: [{ param: 'userId' }] };

	test('normal accounts and endpoints without a declaration are unaffected', async () => {
		await run(s, 'admin/suspend-user', g, users.main, { userId: 'subA' });
		await run(s, 'admin/suspend-user', { denyForSubAccount: true }, users.main, {});
		await run(s, 'admin/suspend-user', g, null, { userId: 'subA' });
		await run(s, 'notes/delete', {}, users.subA, { noteId: 'anything' });
		await run(s, 'admin/show-user', {}, users.subA, { userId: 'main' });
	});

	test('sub cannot target the parent or a sibling', async () => {
		await denied(run(s, 'admin/suspend-user', g, users.subA, { userId: 'main' }));
		await denied(run(s, 'admin/suspend-user', g, users.subA, { userId: 'subB' }));
	});

	test('sub can target an unrelated user, a sub of another family, and unknown ids', async () => {
		await run(s, 'admin/suspend-user', g, users.subA, { userId: 'other' });
		await run(s, 'admin/suspend-user', g, users.subA, { userId: 'otherSub' });
		await run(s, 'admin/suspend-user', g, users.subA, { userId: 'nobody' });
	});

	test('every target is checked, including one family id in an array', async () => {
		const ga: Meta = { protectFamily: [{ param: 'userIds', array: true }] };
		await run(s, 'x', ga, users.subA, { userIds: ['other', 'nobody'] });
		await denied(run(s, 'x', ga, users.subA, { userIds: ['other', 'subB'] }));
		await denied(run(s, 'x', { protectFamily: [{ param: 'a' }, { param: 'b' }] }, users.subA, { a: 'other', b: 'main' }));
	});

	test('denySelf refuses sub self-targeting', async () => {
		const gs: Meta = { protectFamily: [{ param: 'userId', denySelf: true }] };
		await denied(run(s, 'admin/delete-account', gs, users.subA, { userId: 'subA' }));
		await run(s, 'admin/delete-account', gs, users.main, { userId: 'main' });
	});

	test('denyForSubAccount refuses subs only', async () => {
		await denied(run(s, 'admin/captcha/save', { denyForSubAccount: true }, users.subA, {}));
	});

	test('server-settings: sign-in, registration and access keys are refused, the rest is allowed', async () => {
		const r: Meta = { protectFamilyRule: 'server-settings' };
		await run(s, 'admin/update-meta', r, users.subA, { name: 'x', description: 'y' });
		await denied(run(s, 'admin/update-meta', r, users.subA, { name: 'x', disableRegistration: false }));
		await denied(run(s, 'admin/update-meta', r, users.subA, { approvalRequiredForSignup: true }));
		await run(s, 'admin/update-meta', r, users.subA, { disableRegistration: undefined, name: 'x' });
		await run(s, 'admin/update-meta', r, users.main, { disableRegistration: false });
	});

	test('role-definition rule', async () => {
		const r: Meta = { protectFamilyRule: 'role-definition' };
		await run(s, 'admin/roles/create', r, users.subA, { target: 'manual', isPublic: false });
		await denied(run(s, 'admin/roles/create', r, users.subA, { target: 'conditional', isPublic: false }));
		await denied(run(s, 'admin/roles/create', r, users.subA, { target: 'manual', isPublic: true }));
		await denied(run(s, 'admin/roles/update-default-policies', r, users.subA, {}));
		await run(s, 'admin/roles/update', r, users.subA, { roleId: 'manualPrivate', target: 'manual', isPublic: false });
		await run(s, 'admin/roles/delete', r, users.subA, { roleId: 'heldBySelf' });
		await denied(run(s, 'admin/roles/update', r, users.subA, { roleId: 'manualPublic', target: 'manual', isPublic: false }));
		await denied(run(s, 'admin/roles/update', r, users.subA, { roleId: 'conditional', target: 'manual', isPublic: false }));
		await denied(run(s, 'admin/roles/update', r, users.subA, { roleId: 'manualPrivate', target: 'conditional', isPublic: false }));
		await denied(run(s, 'admin/roles/update', r, users.subA, { roleId: 'manualPrivate', target: 'manual', isPublic: true }));
		await denied(run(s, 'admin/roles/delete', r, users.subA, { roleId: 'heldByFamily' }));
		await run(s, 'admin/roles/delete', r, users.subA, { roleId: 'nope' });
		await run(s, 'admin/roles/update-default-policies', r, users.main, {});
	});
});

const isGuarded = (meta: any) => meta.denyForSubAccount === true || meta.protectFamily != null || meta.protectFamilyRule != null;

describe('endpoint audit (lockout of the main account)', () => {
	const privileged = endpoints.filter(e => (e.meta as any).requireAdmin || (e.meta as any).requireModerator);

	// requireAdmin / requireModerator endpoints that were reviewed and cannot lock the main account out.
	// A new privileged endpoint must either declare denyForSubAccount / protectFamily / protectFamilyRule
	// or be added here after review.
	const reviewedNotLockout = new Set<string>([
		'admin/abuse-report/notification-recipient/create',
		'admin/abuse-report/notification-recipient/delete',
		'admin/abuse-report/notification-recipient/list',
		'admin/abuse-report/notification-recipient/show',
		'admin/abuse-report/notification-recipient/update',
		'admin/abuse-user-reports',
		'admin/accounts/find-by-email',
		'admin/ad/create',
		'admin/ad/delete',
		'admin/ad/list',
		'admin/ad/update',
		'admin/announcements/create',
		'admin/announcements/delete',
		'admin/announcements/list',
		'admin/announcements/update',
		'admin/approve-user',
		'admin/captcha/current',
		'admin/clear-suspicious-login-flag',
		'admin/contact-form/delete',
		'admin/contact-form/list',
		'admin/contact-form/show',
		'admin/contact-form/update',
		'admin/drive/clean-remote-files',
		'admin/drive/cleanup',
		'admin/drive/files',
		'admin/drive/show-file',
		'admin/drop-all-notes',
		'admin/emoji/import-zip',
		'admin/federation/delete-all-files',
		'admin/federation/followers',
		'admin/federation/following',
		'admin/federation/refresh-remote-instance-metadata',
		'admin/federation/remove-all-following',
		'admin/federation/update-instance',
		'admin/forward-abuse-user-report',
		'admin/get-index-stats',
		'admin/get-table-stats',
		'admin/get-user-ips',
		'admin/invite/create',
		'admin/invite/list',
		'admin/llm-moderation/queue',
		'admin/llm-moderation/queue/resolve',
		'admin/llm-moderation/queue/update',
		'admin/login-risk/diagnose',
		'admin/login-risk/user-footprints',
		'admin/meta',
		'admin/promo/create',
		'admin/queue/clear',
		'admin/queue/deliver-delayed',
		'admin/queue/inbox-delayed',
		'admin/queue/jobs',
		'admin/queue/pause',
		'admin/queue/promote-jobs',
		'admin/queue/queue-stats',
		'admin/queue/queues',
		'admin/queue/remove-job',
		'admin/queue/resume',
		'admin/queue/retry-job',
		'admin/queue/show-job',
		'admin/queue/show-job-logs',
		'admin/queue/stats',
		'admin/relays/add',
		'admin/relays/list',
		'admin/relays/remove',
		'admin/resolve-abuse-user-report',
		'admin/roles/list',
		'admin/roles/show',
		'admin/roles/users',
		'admin/send-email',
		'admin/send-notification',
		'admin/server-info',
		'admin/show-moderation-logs',
		'admin/show-user',
		'admin/show-users',
		'admin/sub-accounts/relations',
		'admin/system-webhook/create',
		'admin/system-webhook/delete',
		'admin/system-webhook/list',
		'admin/system-webhook/show',
		'admin/system-webhook/test',
		'admin/system-webhook/update',
		'admin/unset-user-avatar',
		'admin/unset-user-banner',
		'admin/unsuspend-user',
		'admin/update-abuse-user-report',
		'admin/update-proxy-account',
		'admin/update-user-name',
		'admin/update-user-note',
		'ap/get',
		'export-custom-emojis',
	]);

	test('there are privileged endpoints to audit', () => {
		expect(privileged.length).toBeGreaterThan(50);
	});

	test('every privileged endpoint is either guarded or reviewed (not both)', () => {
		const unreviewed = privileged.filter(e => !isGuarded(e.meta) && !reviewedNotLockout.has(e.name)).map(e => e.name);
		expect(unreviewed).toEqual([]);
		const both = privileged.filter(e => isGuarded(e.meta) && reviewedNotLockout.has(e.name)).map(e => e.name);
		expect(both).toEqual([]);
		const stale = [...reviewedNotLockout].filter(n => !privileged.some(e => e.name === n));
		expect(stale).toEqual([]);
	});

	test('protectFamily declarations point at real params', () => {
		for (const e of endpoints) {
			const pf = (e.meta as any).protectFamily as { param: string }[] | undefined;
			if (pf == null) continue;
			const props = Object.keys((e.params as any).properties ?? {});
			for (const t of pf) expect(props, `${e.name} param ${t.param}`).toContain(t.param);
		}
	});

	test('the endpoints that can lock the main account out stay guarded', () => {
		const byName = (n: string) => (endpoints.find(x => x.name === n)!.meta as any);
		for (const n of ['admin/suspend-user', 'admin/delete-account', 'admin/accounts/delete', 'admin/decline-user', 'admin/unset-mfa', 'admin/delete-all-files-of-a-user', 'admin/reset-password', 'admin/regenerate-user-token', 'admin/roles/assign', 'admin/roles/unassign']) {
			expect(byName(n).protectFamily, n).toBeDefined();
		}
		for (const n of ['admin/roles/create', 'admin/roles/update', 'admin/roles/delete', 'admin/roles/update-default-policies', 'admin/update-meta']) {
			expect(byName(n).protectFamilyRule, n).toBeDefined();
		}
		expect(byName('admin/captcha/save').denyForSubAccount).toBe(true);
	});

	test('endpoints that subs need for their own content are not guarded', () => {
		for (const n of ['notes/delete', 'notes/make-private', 'drive/files/delete', 'drive/files/update', 'flash/delete', 'gallery/posts/delete', 'channels/update', 'invite/delete']) {
			expect(isGuarded(endpoints.find(x => x.name === n)!.meta), n).toBe(false);
		}
	});

	test('every denied update-meta key exists, and sign-in/registration keys are denied', () => {
		const e = endpoints.find(x => x.name === 'admin/update-meta')!;
		const keys = Object.keys((e.params as any).properties);
		expect([...UPDATE_META_SUB_DENIED_KEYS].filter(k => !keys.includes(k))).toEqual([]);
		for (const k of ['disableRegistration', 'approvalRequiredForSignup', 'emailRequiredForSignup', 'enableLoginRiskDetection', 'singleUserMode', 'enableHcaptcha', 'federation', 'useObjectStorage', 'swPrivateKey']) {
			expect(UPDATE_META_SUB_DENIED_KEYS as readonly string[]).toContain(k);
		}
	});
});

describe('sub-account denied endpoints', () => {
	const expected = [
		'i/2fa/done', 'i/2fa/key-done', 'i/2fa/password-less', 'i/2fa/register-key', 'i/2fa/register', 'i/2fa/remove-key', 'i/2fa/unregister', 'i/2fa/update-key',
		'i/change-password', 'i/update-email', 'i/regenerate-token', 'i/delete-account', 'i/truncate-account', 'i/move',
		'admin/captcha/save',
	];
	test.each(expected.map(n => [n]))('%s is refused for sub-accounts', (name) => {
		const e = endpoints.find(x => x.name === name)!;
		expect(e, name).toBeDefined();
		expect((e.meta as any).denyForSubAccount).toBe(true);
	});

	test('credential and external-API-key endpoints that subs need stay allowed', () => {
		for (const name of ['miauth/gen-token', 'auth/accept', 'i/apps', 'i/authorized-apps', 'i/export-notes', 'i/import-following', 'sw/register', 'i/webhooks/test', 'i/registry/scopes-with-domain']) {
			const e = endpoints.find(x => x.name === name)!;
			expect(e, name).toBeDefined();
			expect(isGuarded(e.meta), name).toBe(false);
		}
	});
});

describe('update-meta classification for sub-accounts', () => {
	// Keys a sub-account moderator may change (reviewed: they cannot lock the main account out).
	// UPDATE_META_SUB_DENIED_KEYS are refused. A newly added update-meta key must be added to one of the two lists.
	const reviewedAllowedKeys: readonly string[] = [
		'pinnedUsers',
		'hiddenTags',
		'blockedHosts',
		'sensitiveWords',
		'prohibitedWords',
		'themeColor',
		'mascotImageUrl',
		'bannerUrl',
		'serverErrorImageUrl',
		'infoImageUrl',
		'notFoundImageUrl',
		'iconUrl',
		'app192IconUrl',
		'app512IconUrl',
		'backgroundImageUrl',
		'logoImageUrl',
		'name',
		'shortName',
		'description',
		'defaultLightTheme',
		'defaultDarkTheme',
		'clientOptions',
		'cacheRemoteFiles',
		'cacheRemoteSensitiveFiles',
		'googleAnalyticsMeasurementId',
		'sensitiveMediaDetection',
		'sensitiveMediaDetectionSensitivity',
		'setSensitiveFlagAutomatically',
		'enableSensitiveMediaDetectionForVideos',
		'sensitiveMediaDetectionTimeout',
		'sensitiveMediaDetectionMaxImagesPerRequest',
		'maintainerName',
		'maintainerEmail',
		'langs',
		'tosUrl',
		'repositoryUrl',
		'feedbackUrl',
		'impressumUrl',
		'privacyPolicyUrl',
		'inquiryUrl',
		'enableChartsForRemoteUser',
		'enableChartsForFederatedInstances',
		'enableStatsForFederatedInstances',
		'enableServerMachineStats',
		'enableIdenticonGeneration',
		'serverRules',
		'enableFanoutTimeline',
		'enableFanoutTimelineDbFallback',
		'perLocalUserUserTimelineCacheMax',
		'perRemoteUserUserTimelineCacheMax',
		'perUserHomeTimelineCacheMax',
		'perUserListTimelineCacheMax',
		'enableReactionsBuffering',
		'notesPerOneAd',
		'silencedHosts',
		'mediaSilencedHosts',
		'urlPreviewEnabled',
		'urlPreviewAllowRedirect',
		'urlPreviewTimeout',
		'urlPreviewMaximumContentLength',
		'urlPreviewRequireContentLength',
		'urlPreviewUserAgent',
		'urlPreviewSensitiveList',
		'enableRemoteNotesCleaning',
		'remoteNotesCleaningExpiryDaysForEachNotes',
		'remoteNotesCleaningMaxProcessingDurationInMinutes',
		'showRoleBadgesOfRemoteUsers',
		'youBlockedImageUrl',
		'enableLongIconUrl',
		'longIconUrl',
		'backgroundImageUrls',
		'objectStorageCacheDays',
		'blockMentionsFromUnfamiliarRemoteUsers',
		'hanaThemeColor',
		'hanaThemeAltColor',
		'hanaThemeWeakOpacity',
		'hanaModeIcon',
		'hanaModeIconSize',
		'hanaModeIconRadius',
		'hanaModeBackground',
		'allowAnonymousStats',
		'allowAnonymousOnlineUsersCount',
		'allowAnonymousChartActiveUsers',
		'allowAnonymousChartApRequest',
		'allowAnonymousChartDrive',
		'allowAnonymousChartFederation',
		'allowAnonymousChartInstance',
		'allowAnonymousChartNotes',
		'allowAnonymousChartUsers',
		'allowAnonymousFederationUsers',
		'allowAnonymousFederationStats',
		'allowAnonymousShowInstance',
		'allowAnonymousReplies',
		'allowAnonymousRenotes',
		'allowAnonymousQuotes',
		'allowAnonymousFederationInstances',
		'allowAnonymousFeatured',
		'allowAnonymousLocalTimeline',
		'customSplashText',
		'defaultFollowedUsers',
		'forciblyFollowedUsers',
		'enableCpuModel',
		'customCpuModel',
		'enableCpuCore',
		'customCpuCore',
		'enableMemTotal',
		'customMemTotal',
		'enableFsTotal',
		'customFsTotal',
		'entranceShowTimeLine',
		'entranceShowFeatured',
		'entranceShowEmojis',
		'entranceSelectEmojis',
		'entranceShowStats',
		'entranceShowFederation',
		'entranceShowDashboard',
		'entranceShowAnotherInstance',
		'entranceMarginLeft',
		'entranceMarginRight',
		'entranceMarginTop',
		'entranceMarginBottom',
		'serverGeminiEnabled',
		'serverGeminiModels',
		'customCursorUrl',
		'customCursorPointerUrl',
		'customCursorTextUrl',
		'customCursorProgressUrl',
		'customCursorWaitUrl',
		'enableContactForm',
		'contactFormLimit',
		'contactFormCategories',
	];

	test('every update-meta key is classified as denied or reviewed-allowed', () => {
		const e = endpoints.find(x => x.name === 'admin/update-meta')!;
		const keys = Object.keys((e.params as any).properties);
		const known = new Set<string>([...reviewedAllowedKeys, ...UPDATE_META_SUB_DENIED_KEYS]);
		expect(keys.filter(k => !known.has(k))).toEqual([]);
		expect(reviewedAllowedKeys.filter(k => !keys.includes(k))).toEqual([]);
		expect(reviewedAllowedKeys.filter(k => (UPDATE_META_SUB_DENIED_KEYS as readonly string[]).includes(k))).toEqual([]);
	});
});
