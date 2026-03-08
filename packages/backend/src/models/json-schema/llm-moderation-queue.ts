/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedLlmModerationQueueSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		noteId: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		note: {
			type: 'object',
			optional: true,
			nullable: true,
			ref: 'Note',
		},
		noteUserId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
		noteUser: {
			type: 'object',
			optional: true,
			nullable: true,
			ref: 'UserDetailedNotMe',
		},
		noteUserHost: {
			type: 'string',
			optional: false,
			nullable: true,
		},
		noteVisibility: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		isRemote: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		provider: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		model: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		flaggedCategories: {
			type: 'array',
			optional: false,
			nullable: false,
			items: {
				type: 'string',
				optional: false,
				nullable: false,
			},
		},
		categoryScores: {
			type: 'object',
			optional: false,
			nullable: false,
			additionalProperties: {
				type: 'number',
			},
		},
		resolved: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		assigneeId: {
			type: 'string',
			optional: false,
			nullable: true,
			format: 'id',
		},
		assignee: {
			type: 'object',
			optional: false,
			nullable: true,
			ref: 'UserDetailedNotMe',
		},
		moderationNote: {
			type: 'string',
			optional: false,
			nullable: false,
		},
	},
} as const;
