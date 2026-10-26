/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { familyGuard } from '@/server/api/family-guard.js';

export const meta = {
	tags: ['admin', 'system-webhook'],

	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin:system-webhook',

	familyGuard: familyGuard.subDenied,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'misskey:id',
		},
	},
	required: [
		'id',
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private systemWebhookService: SystemWebhookService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.systemWebhookService.deleteSystemWebhook(
				ps.id,
				me,
			);
		});
	}
}
