/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import si from 'systeminformation';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,

	tags: ['meta'],
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			machine: {
				type: 'string',
				nullable: false,
			},
			cpu: {
				type: 'object',
				nullable: false,
				properties: {
					model: {
						type: 'string',
						nullable: false,
					},
					cores: {
						type: 'number',
						nullable: false,
					},
				},
			},
			mem: {
				type: 'object',
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
				},
			},
			fs: {
				type: 'object',
				nullable: false,
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
					used: {
						type: 'number',
						nullable: false,
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,
	) {
		super(meta, paramDef, async () => {
			if (!this.serverSettings.enableServerMachineStats) return {
				machine: '?',
				cpu: {
					model: '?',
					cores: 0,
				},
				mem: {
					total: 0,
				},
				fs: {
					total: 0,
					used: 0,
				},
			};

			const memStats = await si.mem();
			const fsStats = await si.fsSize();

			const cpuModel = this.serverSettings.enableCpuModel
				? (this.serverSettings.customCpuModel && this.serverSettings.customCpuModel !== '0')
					? this.serverSettings.customCpuModel
					: os.cpus()[0]?.model || '?'
				: '?';

			const cpuCores = this.serverSettings.enableCpuCore
				? (this.serverSettings.customCpuCore && this.serverSettings.customCpuCore !== 0)
					? this.serverSettings.customCpuCore
					: os.cpus().length
				: 0;

			const memTotal = this.serverSettings.enableMemTotal
				? (this.serverSettings.customMemTotal && this.serverSettings.customMemTotal !== 0)
					? this.serverSettings.customMemTotal * 1024 * 1024 * 1024
					: memStats.total
				: 0;

			const fsTotal = this.serverSettings.enableFsTotal
				? (this.serverSettings.customFsTotal && this.serverSettings.customFsTotal !== 0)
					? this.serverSettings.customFsTotal * 1024 * 1024 * 1024
					: fsStats[0]?.size
				: 0;

			return {
				machine: os.hostname(),
				cpu: {
					model: cpuModel,
					cores: cpuCores,
				},
				mem: {
					total: memTotal,
				},
				fs: {
					total: fsTotal,
					used: this.serverSettings.enableFsTotal ? fsStats[0]?.used : 0,
				},
			};
		});
	}
}
