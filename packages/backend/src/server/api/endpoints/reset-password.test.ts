/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { ApiError } from '../error.js';
import ResetPassword from './reset-password.js';

test('an expired reset token returns a client error without changing the password', async () => {
	const deleteRequest = vi.fn();
	const updateProfile = vi.fn();
	const endpoint = new ResetPassword(
		{ findOneBy: vi.fn().mockResolvedValue({ id: 'request-id', userId: 'user-id' }), delete: deleteRequest } as any,
		{ update: updateProfile } as any,
		{ parse: () => ({ date: new Date(Date.now() - 31 * 60_000) }) } as any,
	);

	const result = endpoint.exec({ token: 'expired-token', password: 'new-password' }, null, null);
	await expect(result).rejects.toBeInstanceOf(ApiError);
	await expect(result).rejects.toMatchObject({ code: 'NO_SUCH_TOKEN', kind: 'client' });
	expect(updateProfile).not.toHaveBeenCalled();
	expect(deleteRequest).not.toHaveBeenCalled();
});
