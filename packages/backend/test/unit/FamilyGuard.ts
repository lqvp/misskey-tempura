/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { FamilyGuardService } from '@/core/FamilyGuardService.js';
import { familyGuard } from '@/server/api/family-guard.js';
import endpoints from '@/server/api/endpoints.js';
import { ApiError } from '@/server/api/error.js';
import { UPDATE_META_SUB_ALLOWED_KEYS, UPDATE_META_SUB_DENIED_KEYS } from '@/server/api/family-guard.js';

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
	const owned = (m: Record<string, string>) => ({ findOne: async ({ where }: any) => (m[where.id] ? { id: where.id, userId: m[where.id] } : null) });
	return new FamilyGuardService(
		usersRepository as never, rolesRepository as never, roleAssignmentsRepository as never,
		owned({ noteMain: 'main', noteSelf: 'subA', noteOther: 'other' }) as never,
		owned({ fileSib: 'subB' }) as never, owned({ flashMain: 'main' }) as never, owned({ postSib: 'subB' }) as never,
		owned({ chMain: 'main' }) as never, { findOne: async ({ where }: any) => (where.id === 'invMain' ? { id: 'invMain', createdById: 'main' } : null) } as never,
	);
}

const run = (s: FamilyGuardService, name: string, guard: any, actor: U | null, data: any) => s.assertAllowed(name, guard, actor, data);
const denied = async (p: Promise<void>) => {
	const e = await p.then(() => null, (err: unknown) => err);
	expect(e).toBeInstanceOf(ApiError);
	return e as ApiError;
};

describe('FamilyGuardService', () => {
	const s = createService();
	const g = familyGuard.targets({ param: 'userId' });

	test('normal accounts are unaffected', async () => {
		await run(s, 'admin/suspend-user', g, users.main, { userId: 'subA' });
		await run(s, 'admin/suspend-user', familyGuard.subDenied, users.main, {});
		await run(s, 'admin/suspend-user', g, null, { userId: 'subA' });
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
		const ga = familyGuard.targets({ param: 'userIds', array: true });
		await run(s, 'x', ga, users.subA, { userIds: ['other', 'nobody'] });
		await denied(run(s, 'x', ga, users.subA, { userIds: ['other', 'subB'] }));
		await denied(run(s, 'x', familyGuard.targets({ param: 'a' }, { param: 'b' }), users.subA, { a: 'other', b: 'main' }));
	});

	test('resource targets are resolved to their owner', async () => {
		const note = familyGuard.targets({ param: 'noteId', resolve: 'note' });
		await denied(run(s, 'notes/delete', note, users.subA, { noteId: 'noteMain' }));
		await run(s, 'notes/delete', note, users.subA, { noteId: 'noteSelf' });
		await run(s, 'notes/delete', note, users.subA, { noteId: 'noteOther' });
		await run(s, 'notes/delete', note, users.subA, { noteId: 'missing' });
		await denied(run(s, 'drive/files/delete', familyGuard.targets({ param: 'fileId', resolve: 'file' }), users.subA, { fileId: 'fileSib' }));
		await denied(run(s, 'flash/delete', familyGuard.targets({ param: 'flashId', resolve: 'flash' }), users.subA, { flashId: 'flashMain' }));
		await denied(run(s, 'gallery/posts/delete', familyGuard.targets({ param: 'postId', resolve: 'galleryPost' }), users.subA, { postId: 'postSib' }));
		await run(s, 'notes/delete', note, users.main, { noteId: 'noteMain' });
	});

	test('denySelf refuses sub self-targeting', async () => {
		const gs = familyGuard.targets({ param: 'userId', denySelf: true });
		await denied(run(s, 'admin/delete-account', gs, users.subA, { userId: 'subA' }));
		await run(s, 'admin/delete-account', gs, users.main, { userId: 'main' });
	});

	test('channel and invite owners are resolved', async () => {
		await denied(run(s, 'channels/update', familyGuard.targets({ param: 'channelId', resolve: 'channel' }), users.subA, { channelId: 'chMain' }));
		await denied(run(s, 'invite/delete', familyGuard.targets({ param: 'inviteId', resolve: 'invite' }), users.subA, { inviteId: 'invMain' }));
		await run(s, 'channels/update', familyGuard.targets({ param: 'channelId', resolve: 'channel' }), users.subA, { channelId: 'nothing' });
	});

	test('subDenied refuses subs only', async () => {
		await denied(run(s, 'admin/captcha/save', familyGuard.subDenied, users.subA, {}));
	});

	test('server-settings: auth/registration keys and unclassified keys are refused', async () => {
		const r = familyGuard.rule('server-settings');
		await run(s, 'admin/update-meta', r, users.subA, { name: 'x', description: 'y' });
		await denied(run(s, 'admin/update-meta', r, users.subA, { name: 'x', disableRegistration: false }));
		await denied(run(s, 'admin/update-meta', r, users.subA, { approvalRequiredForSignup: true }));
		await denied(run(s, 'admin/update-meta', r, users.subA, { someFutureKey: 1 }));
		await run(s, 'admin/update-meta', r, users.subA, { disableRegistration: undefined, name: 'x' });
		await run(s, 'admin/update-meta', r, users.main, { disableRegistration: false });
	});

	test('role-definition rule', async () => {
		const r = familyGuard.rule('role-definition');
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

describe('endpoint classification', () => {
	const privileged = endpoints.filter(e => (e.meta as any).requireAdmin || (e.meta as any).requireModerator);

	test('there are privileged endpoints to classify', () => {
		expect(privileged.length).toBeGreaterThan(50);
	});

	test.each(privileged.map(e => [e.name]))('%s declares familyGuard', (name) => {
		const e = endpoints.find(x => x.name === name)!;
		const fg = (e.meta as any).familyGuard;
		expect(fg, `${name} must declare familyGuard`).toBeDefined();
		if (fg.kind === 'notApplicable') expect(fg.reason.length).toBeGreaterThan(0);
	});

	test('endpoints that take a target user id are not silently notApplicable unless explained', () => {
		const targetParams = ['userId', 'targetUserId'];
		const offenders = privileged.filter(e => {
			const fg = (e.meta as any).familyGuard;
			const props = Object.keys((e.params as any).properties ?? {});
			return fg?.kind === 'notApplicable' && props.some(p => targetParams.includes(p)) && !/recipient|read filter|read-only/.test(fg.reason);
		});
		expect(offenders.map(e => e.name)).toEqual([]);
	});

	test('targets declarations point at real params', () => {
		for (const e of endpoints) {
			const fg = (e.meta as any).familyGuard;
			if (fg?.kind !== 'targets') continue;
			const props = Object.keys((e.params as any).properties ?? {});
			for (const t of fg.targets) expect(props, `${e.name} param ${t.param}`).toContain(t.param);
		}
	});

	test('every update-meta key is classified for sub-accounts', () => {
		const e = endpoints.find(x => x.name === 'admin/update-meta')!;
		const keys = Object.keys((e.params as any).properties);
		const known = new Set<string>([...UPDATE_META_SUB_ALLOWED_KEYS, ...UPDATE_META_SUB_DENIED_KEYS]);
		expect(keys.filter(k => !known.has(k))).toEqual([]);
		expect([...known].filter(k => !keys.includes(k))).toEqual([]);
	});

	test('sign-in, registration and access keys stay denied', () => {
		for (const k of ['disableRegistration', 'approvalRequiredForSignup', 'emailRequiredForSignup', 'enableLoginRiskDetection', 'singleUserMode', 'enableHcaptcha']) {
			expect(UPDATE_META_SUB_DENIED_KEYS as readonly string[]).toContain(k);
		}
	});
});

describe('sub-account infra keys', () => {
	test('storage, federation, security keys and external destinations stay denied for subs', () => {
		for (const k of ['useObjectStorage', 'objectStorageEndpoint', 'objectStorageSecretKey', 'swPrivateKey', 'federation', 'federationHosts', 'signToActivityPubGet', 'requireSignedApFetch', 'openLlmModerationApiUrl', 'sensitiveMediaDetectionApiUrl', 'summalyProxy', 'deeplAuthKey', 'serverGeminiApiKey', 'manifestJsonOverride']) {
			expect(UPDATE_META_SUB_DENIED_KEYS as readonly string[]).toContain(k);
			expect(UPDATE_META_SUB_ALLOWED_KEYS as readonly string[]).not.toContain(k);
		}
	});
});

describe('sub-account denied endpoints', () => {
	const expected = [
		'i/2fa/done', 'i/2fa/key-done', 'i/2fa/password-less', 'i/2fa/register-key', 'i/2fa/register', 'i/2fa/remove-key', 'i/2fa/unregister', 'i/2fa/update-key',
		'i/change-password', 'i/update-email', 'i/regenerate-token', 'i/delete-account', 'i/truncate-account', 'i/move',
		'admin/captcha/save',
		'admin/queue/clear', 'admin/queue/pause', 'admin/queue/resume', 'admin/queue/remove-job', 'admin/queue/retry-job', 'admin/queue/promote-jobs', 'admin/send-email', 'admin/update-proxy-account', 'admin/system-webhook/create', 'admin/system-webhook/update', 'admin/system-webhook/delete', 'admin/system-webhook/test', 'admin/relays/add', 'admin/relays/remove',
	];
	test.each(expected.map(n => [n]))('%s is refused for sub-accounts', (name) => {
		const e = endpoints.find(x => x.name === name)!;
		expect(e, name).toBeDefined();
		expect((e.meta as any).familyGuard).toEqual(familyGuard.subDenied);
	});

	test('credential and external-API-key endpoints that subs need stay allowed', () => {
		for (const name of ['miauth/gen-token', 'auth/accept', 'i/apps', 'i/authorized-apps', 'i/export-notes', 'i/import-following', 'sw/register', 'i/webhooks/test', 'i/registry/scopes-with-domain']) {
			const e = endpoints.find(x => x.name === name)!;
			expect(e, name).toBeDefined();
			expect((e.meta as any).familyGuard).toBeUndefined();
		}
	});

	test('secure endpoints are either refused for subs or deliberately left allowed (no unreviewed new ones)', () => {
		const reviewedAllowed = new Set([
			'miauth/gen-token', 'auth/accept', 'i/apps', 'i/authorized-apps', 'fetch-external-resources', 'page-push', 'sw/register', 'sw/show-registration', 'sw/update-registration',
			'i/export-clips', 'i/export-blocking', 'i/export-mute', 'i/export-following', 'i/export-user-lists', 'i/export-notes', 'i/export-antennas', 'i/export-favorites',
			'i/import-user-lists', 'i/import-muting', 'i/import-blocking', 'i/import-antennas', 'i/import-following', 'i/webhooks/test', 'i/profile-counts-control',
			'i/signin-history', 'i/login-risk-footprints', 'i/registry/scopes-with-domain',
			'roles/assign', 'roles/unassign', 'roles/update', 'roles/add', 'export-custom-emojis',
		]);
		const unreviewed = endpoints.filter(e => (e.meta as any).secure && !(e.meta as any).familyGuard && !reviewedAllowed.has(e.name));
		expect(unreviewed.map(e => e.name)).toEqual([]);
	});
});
