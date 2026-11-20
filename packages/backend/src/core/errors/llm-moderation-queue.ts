/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const noSuchLlmModerationQueueError = {
	message: 'No such LLM moderation queue item.',
	code: 'NO_SUCH_LLM_MODERATION_QUEUE',
	id: '15a7c5d2-1533-44a6-9ff4-cfc40dce8a75',
	kind: 'server',
	httpStatusCode: 404,
} as const;

export const alreadyResolvedError = {
	message: 'That LLM moderation queue item has already been resolved.',
	code: 'ALREADY_RESOLVED_LLM_MODERATION_QUEUE',
	id: '3f9b1e64-2b46-4f8a-9e27-01c0e5a1b2f3',
	kind: 'server',
	httpStatusCode: 409,
} as const;
