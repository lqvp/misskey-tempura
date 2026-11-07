/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import _Ajv from 'ajv';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import Logger from '@/logger.js';
import type { AntennasRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { Schema, SchemaType } from '@/misc/json-schema.js';
import { validateAntennaRegexKeywords } from '@/misc/antenna-regex.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import { DBAntennaImportJobData } from '../types.js';
import type * as Bull from 'bullmq';

const Ajv = _Ajv.default;

const exportedAntennaSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListAccts: {
			type: 'array',
			items: {
				type: 'string',
			},
			nullable: true,
		},
		keywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		excludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		mustExcludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		expression: { type: 'string', nullable: true },
		keywordMode: { type: 'string', enum: ['literal', 'regex', null], nullable: true },
		users: { type: 'array', items: {
			type: 'string',
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
		onlyFollowers: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const satisfies Schema;

export type ExportedAntenna = SchemaType<typeof exportedAntennaSchema>;

const validate = new Ajv().compile<ExportedAntenna>(exportedAntennaSchema);

@Injectable()
export class ImportAntennasProcessorService {
	private logger: Logger;

	constructor (
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private queueLoggerService: QueueLoggerService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('import-antennas');
	}

	@bindThis
	public async process(job: Bull.Job<DBAntennaImportJobData>): Promise<void> {
		const now = new Date();
		// スキップしたアンテナはユーザーから見えなくなるため、件数と理由を最後にまとめてログへ残す
		const skipped: { name: string; reason: 'emptyKeywords' | 'invalidShape' | 'invalidRegex' }[] = [];
		try {
			for (const antenna of job.data.antenna) {
				// 形が壊れた項目は名前すら取れないことがあるので、スキップ記録は形状検証の後に作る
				if (!validate(antenna)) {
					this.logger.warn('Validation Failed');
					const rawName: unknown = (antenna as { name?: unknown }).name;
					skipped.push({ name: typeof rawName === 'string' ? rawName : '(unknown)', reason: 'invalidShape' });
					continue;
				}
				if (antenna.keywords.length === 0 || antenna.keywords[0].every(x => x === '')) {
					skipped.push({ name: antenna.name, reason: 'emptyKeywords' });
					continue;
				}
				const keywordMode = antenna.keywordMode ?? 'literal';
				const regexError = keywordMode === 'regex'
					? validateAntennaRegexKeywords([antenna.keywords, antenna.excludeKeywords, antenna.mustExcludeKeywords ?? []])
					: null;
				if (regexError != null) {
					this.logger.warn(`Skipped antenna with invalid regex: ${antenna.name} (${regexError.reason}${regexError.pattern != null ? ': ' + regexError.pattern : ''})`);
					skipped.push({ name: antenna.name, reason: 'invalidRegex' });
					continue;
				}
				const result = await this.antennasRepository.insertOne({
					id: this.idService.gen(now.getTime()),
					lastUsedAt: now,
					userId: job.data.user.id,
					name: antenna.name,
					src: antenna.src === 'list' && antenna.userListAccts ? 'users' : antenna.src,
					userListId: null,
					keywords: antenna.keywords,
					excludeKeywords: antenna.excludeKeywords,
					mustExcludeKeywords: antenna.mustExcludeKeywords ?? [],
					expression: antenna.expression ?? null,
					keywordMode,
					users: (antenna.src === 'list' && antenna.userListAccts !== null ? antenna.userListAccts : antenna.users).filter(Boolean),
					caseSensitive: antenna.caseSensitive,
					localOnly: antenna.localOnly,
					excludeBots: antenna.excludeBots,
					withReplies: antenna.withReplies,
					withFile: antenna.withFile,
					excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
					onlyFollowers: antenna.onlyFollowers,
				});
				this.logger.succ('Antenna created: ' + result.id);
				this.globalEventService.publishInternalEvent('antennaCreated', result);
			}
			if (skipped.length > 0) {
				this.logger.warn(`Skipped ${skipped.length} antenna(s) of ${job.data.antenna.length}: ${skipped.map(x => `${x.name} (${x.reason})`).join(', ')}`);
			}
			this.logger.succ(`Antenna import finished: imported ${job.data.antenna.length - skipped.length}, skipped ${skipped.length}`);
		} catch (err: any) {
			this.logger.error(err);
		}
	}
}
