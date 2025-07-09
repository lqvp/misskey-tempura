/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedContactFormSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
		},
		createdAt: {
			type: 'string',
			nullable: false, optional: false,
			format: 'date-time',
		},
		updatedAt: {
			type: 'string',
			nullable: true, optional: false,
			format: 'date-time',
		},
		subject: {
			type: 'string',
			nullable: false, optional: false,
		},
		content: {
			type: 'string',
			nullable: false, optional: false,
		},
		name: {
			type: 'string',
			nullable: true, optional: false,
		},
		email: {
			type: 'string',
			nullable: true, optional: false,
		},
		misskeyUsername: {
			type: 'string',
			nullable: true, optional: false,
		},
		replyMethod: {
			type: 'string',
			nullable: false, optional: false,
			enum: ['email', 'misskey'],
		},
		category: {
			type: 'string',
			nullable: false, optional: false,
		},
		status: {
			type: 'string',
			nullable: false, optional: false,
			enum: ['pending', 'in_progress', 'resolved', 'closed'],
		},
		adminNote: {
			type: 'string',
			nullable: true, optional: false,
		},
		ipAddress: {
			type: 'string',
			nullable: true, optional: false,
		},
		userAgent: {
			type: 'string',
			nullable: true, optional: false,
		},
		user: {
			type: 'object',
			nullable: true, optional: false,
			ref: 'UserLite',
		},
		assignedUser: {
			type: 'object',
			nullable: true, optional: false,
			ref: 'UserLite',
		},
		assignedNickname: {
			type: 'string',
			nullable: true, optional: false,
		},
	},
} as const;
