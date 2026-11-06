/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { notifySsoLinksRemoved } from '@/misc/sso-unlink-notify.js';

function makeDeps(profiles: Record<string, { email: string | null; emailVerified: boolean } | null>, failFor: string[] = []) {
	const createNotification = vi.fn((userId: string) => {
		if (failFor.includes(userId)) throw new Error('boom');
	});
	const sendEmail = vi.fn(async () => undefined);
	const onError = vi.fn();
	return {
		createNotification, sendEmail, onError,
		deps: {
			notificationService: { createNotification },
			emailService: { sendEmail },
			userProfilesRepository: { findOneBy: async ({ userId }: { userId: string }) => profiles[userId] ?? null },
			onError,
		},
	};
}

describe('notifySsoLinksRemoved', () => {
	test('全員にアプリ内通知を送り、確認済みのメールがある人にだけメールも送る', async () => {
		const { deps, createNotification, sendEmail } = makeDeps({
			a: { email: 'a@example.com', emailVerified: true },
			b: { email: 'b@example.com', emailVerified: false },
			c: { email: null, emailVerified: false },
		});
		await notifySsoLinksRemoved(deps, ['a', 'b', 'c'], 'Corp <SSO>');
		expect(createNotification).toHaveBeenCalledTimes(3);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		const call = (sendEmail.mock.calls[0] as unknown) as [string, string, string, string];
		expect(call[0]).toBe('a@example.com');
		expect(call[2]).not.toContain('<SSO>');
		expect(call[2]).toContain('&lt;SSO&gt;');
	});

	test('1人の失敗で他の人への通知は止まらない', async () => {
		const { deps, createNotification, onError } = makeDeps({}, ['a']);
		await notifySsoLinksRemoved(deps, ['a', 'b'], 'x');
		expect(createNotification).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

describe('notifySsoLinksRemoved (理由)', () => {
	test('管理者の操作による解除は、通知文にそのことが書かれる', async () => {
		const { deps, createNotification } = makeDeps({});
		await notifySsoLinksRemoved(deps, ['a'], 'x', 'admin');
		const data = (createNotification.mock.calls[0] as unknown) as [string, string, { customBody: string }];
		expect(data[2].customBody).toContain('管理者の操作');
		expect(data[2].customBody).toContain('administrator');
	});
});
