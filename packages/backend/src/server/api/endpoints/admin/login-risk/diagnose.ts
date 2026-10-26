/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import { isPrivateOrLoopbackIp } from '@/misc/ip-prefix.js';
import { familyGuard } from '@/server/api/family-guard.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ip: { type: 'string', optional: false, nullable: false },
			xForwardedFor: { type: 'string', optional: false, nullable: true },
			hasCfConnectingIp: { type: 'boolean', optional: false, nullable: false },
			hasCfIpCountry: { type: 'boolean', optional: false, nullable: false },
			verdict: { type: 'string', optional: false, nullable: false, enum: ['ok', 'privateIp'] },
			intel: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					country: { type: 'string', optional: false, nullable: true },
					asn: { type: 'number', optional: false, nullable: true },
					asnOrg: { type: 'string', optional: false, nullable: true },
					tor: { type: 'boolean', optional: false, nullable: false },
					spamhausDrop: { type: 'boolean', optional: false, nullable: false },
					datacenter: { type: 'boolean', optional: false, nullable: false },
					vpn: { type: 'boolean', optional: false, nullable: false },
				},
			},
			sources: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						name: { type: 'string', optional: false, nullable: false, enum: ['country', 'asn', 'tor', 'spamhausDropV4', 'spamhausDropV6', 'spamhausAsnDrop', 'datacenter', 'vpn'] },
						loaded: { type: 'boolean', optional: false, nullable: false },
						version: { type: 'string', optional: false, nullable: true },
						updatedAt: { type: 'string', optional: false, nullable: true },
						entries: { type: 'number', optional: false, nullable: true },
					},
				},
			},
		},
	},

	familyGuard: familyGuard.notApplicable('no user target and no effect on sign-in or access of other accounts'),
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private ipIntelligenceService: IpIntelligenceService,
	) {
		super(meta, paramDef, async (ps, me, token, file, cleanup, ip, headers) => {
			const h = headers ?? {};
			const clientIp = ip ?? '';

			return {
				ip: clientIp,
				xForwardedFor: h['x-forwarded-for'] ?? null,
				hasCfConnectingIp: h['cf-connecting-ip'] != null,
				hasCfIpCountry: h['cf-ipcountry'] != null,
				verdict: isPrivateOrLoopbackIp(clientIp) ? 'privateIp' : 'ok',
				intel: this.ipIntelligenceService.lookup(clientIp, h),
				sources: this.ipIntelligenceService.getStatus(),
			};
		});
	}
}
