/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ApiError } from './error.js';

const defs = {
	NOT_ALLOWED: { message: 'Your role does not allow creating sub-accounts.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a01' },
	LIMIT_REACHED: { message: 'The sub-account limit has been reached.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a02' },
	REGISTRATION_CLOSED: { message: 'Registration is closed, so sub-accounts cannot be created.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a03' },
	NOT_READY: { message: 'The server has no root account yet.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a04' },
	INVALID_USERNAME: { message: 'Invalid username.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a05' },
	USERNAME_USED: { message: 'The username is already used.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a06' },
	NO_SUCH_SUB_ACCOUNT: { message: 'No such sub-account.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a07' },
	PENDING_APPROVAL: { message: 'This sub-account is waiting for approval.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a08' },
	SUB_ACCOUNT_SUSPENDED: { message: 'This sub-account is suspended.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a09' },
	CONFIRMATION_REQUIRED: { message: 'This sub-account needs approval; confirm to create it.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a0a' },
	INITIAL_SETTINGS_CLOSED: { message: 'Initial settings can only be saved once, right after creation.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a0c' },
	INITIAL_SETTINGS_REJECTED: { message: 'Some of the settings cannot be copied.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a0d' },
	PARENT_INVALID: { message: 'This account cannot own sub-accounts.', id: '6a2b9d1e-0c0b-4b0e-9d0a-2f1c0c1e7a0b' },
} as const;

export type SubAccountErrorCode = keyof typeof defs;

/** Error thrown by SubAccountService; endpoints convert it to ApiError. */
export class SubAccountError extends Error {
	constructor(public code: SubAccountErrorCode) {
		super(code);
	}
}

export function toApiError(e: unknown): unknown {
	if (e instanceof SubAccountError) {
		const d = defs[e.code];
		return new ApiError({ message: d.message, code: e.code, id: d.id, kind: 'client', httpStatusCode: 400 });
	}
	return e;
}

export const subAccountErrorMeta = Object.fromEntries(Object.entries(defs).map(([code, d]) => [code, { message: d.message, code, id: d.id }])) as {
	[K in SubAccountErrorCode]: { message: string; code: K; id: string };
};
