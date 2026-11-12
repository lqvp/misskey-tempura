/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { UserSuspendService } from '@/core/UserSuspendService.js';

type Row = { id: string; parentUserId: string | null; isSuspended: boolean; suspendedSelf: boolean; suspendedByParent: boolean; username: string; host: string | null };

function setup() {
	const rows: Record<string, Row> = {};
	const add = (id: string, parentUserId: string | null = null) => {
		rows[id] = { id, parentUserId, isSuspended: false, suspendedSelf: false, suspendedByParent: false, username: id, host: null };
	};
	add('main'); add('subA', 'main'); add('subB', 'main'); add('plain');
	const match = (r: Row, w: Partial<Row>) => Object.entries(w).every(([k, v]) => (r as any)[k] === v);
	const usersRepository = {
		update: async (id: string, patch: Partial<Row>) => { Object.assign(rows[id], patch); },
		findOneBy: async (w: Partial<Row>) => Object.values(rows).find(r => match(r, w)) ?? null,
		findBy: async (w: Partial<Row>) => Object.values(rows).filter(r => match(r, w)).map(r => ({ ...r })),
		query: async () => [],
	};
	const none = { delete: vi.fn(), find: vi.fn().mockResolvedValue([]), createQueryBuilder: vi.fn() };
	const service = new UserSuspendService(
		usersRepository as never, none as never, none as never,
		{ isLocalUser: () => false } as never, { deliver: vi.fn() } as never,
		{ publishInternalEvent: vi.fn() } as never, {} as never, { log: vi.fn() } as never,
	);
	return { rows, service, mod: { id: 'mod' } as never };
}

describe('sub-account suspension', () => {
	test('suspending the main account suspends its subs (by parent), not other accounts', async () => {
		const { rows, service, mod } = setup();
		await service.suspend(rows.main as never, mod);
		expect(rows.main).toMatchObject({ isSuspended: true, suspendedSelf: true });
		expect(rows.subA).toMatchObject({ isSuspended: true, suspendedByParent: true, suspendedSelf: false });
		expect(rows.subB).toMatchObject({ isSuspended: true, suspendedByParent: true });
		expect(rows.plain.isSuspended).toBe(false);
	});

	test('unsuspending the main account releases parent-caused suspension only', async () => {
		const { rows, service, mod } = setup();
		await service.suspend(rows.subB as never, mod); // individually suspended
		await service.suspend(rows.main as never, mod);
		await service.unsuspend(rows.main as never, mod);
		expect(rows.main).toMatchObject({ isSuspended: false, suspendedSelf: false });
		expect(rows.subA).toMatchObject({ isSuspended: false, suspendedByParent: false });
		expect(rows.subB).toMatchObject({ isSuspended: true, suspendedSelf: true, suspendedByParent: false });
	});

	test('suspending a sub does not affect the parent or siblings', async () => {
		const { rows, service, mod } = setup();
		await service.suspend(rows.subA as never, mod);
		expect(rows.subA).toMatchObject({ isSuspended: true, suspendedSelf: true });
		expect(rows.main.isSuspended).toBe(false);
		expect(rows.subB.isSuspended).toBe(false);
	});

	test('unsuspending a sub while the parent is suspended keeps it suspended', async () => {
		const { rows, service, mod } = setup();
		await service.suspend(rows.subA as never, mod);
		await service.suspend(rows.main as never, mod);
		await service.unsuspend(rows.subA as never, mod);
		expect(rows.subA).toMatchObject({ isSuspended: true, suspendedSelf: false, suspendedByParent: true });
	});

	test('normal accounts behave as before', async () => {
		const { rows, service, mod } = setup();
		await service.suspend(rows.plain as never, mod);
		expect(rows.plain.isSuspended).toBe(true);
		await service.unsuspend(rows.plain as never, mod);
		expect(rows.plain.isSuspended).toBe(false);
	});
});
