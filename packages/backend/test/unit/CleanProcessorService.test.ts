/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test } from '@nestjs/testing';
import { describe, it, expect, vi } from 'vitest';
import { CleanProcessorService } from '../../src/queue/processors/CleanProcessorService.js';
import { QueueLoggerService } from '../../src/queue/QueueLoggerService.js';
import { ReversiService } from '../../src/core/ReversiService.js';
import { GlobalEventService } from '../../src/core/GlobalEventService.js';
import { IdService } from '../../src/core/IdService.js';
import { DI } from '../../src/di-symbols.js';

// 使われていないアンテナの停止が、実際に無効化された行だけ通知するかのテスト。
// DBが無い環境でも回せるよう、createQueryBuilderのチェーンをスタブする
describe('CleanProcessorService', () => {
	// UPDATE ... RETURNING 相当のスタブ。返したい行を execute の結果として返す
	const makeService = async (returnedRows: unknown[]) => {
		const publishInternalEvent = vi.fn();
		const queryBuilder = {
			update: () => queryBuilder,
			set: () => queryBuilder,
			where: () => queryBuilder,
			returning: () => queryBuilder,
			execute: async () => ({ raw: returnedRows }),
		};
		const antennasRepository = {
			createQueryBuilder: () => queryBuilder,
		};

		const module = await Test.createTestingModule({
			providers: [
				CleanProcessorService,
				{ provide: DI.config, useValue: { deactivateAntennaThreshold: 1000 * 60 * 60 * 24 * 30 } },
				{ provide: DI.userIpsRepository, useValue: { delete: vi.fn(async () => undefined) } },
				{ provide: DI.antennasRepository, useValue: antennasRepository },
				{ provide: DI.roleAssignmentsRepository, useValue: { createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ getMany: async () => [] }) }) }) } },
				{ provide: DI.userLoginContextsRepository, useValue: { delete: vi.fn(async () => undefined) } },
				{ provide: QueueLoggerService, useValue: { logger: { createSubLogger: () => ({ info: vi.fn(), succ: vi.fn(), warn: vi.fn(), error: vi.fn() }) } } },
				{ provide: ReversiService, useValue: { cleanOutdatedGames: vi.fn() } },
				{ provide: GlobalEventService, useValue: { publishInternalEvent } },
				{ provide: IdService, useValue: {} },
			],
		}).compile();

		return { service: module.get(CleanProcessorService), publishInternalEvent };
	};

	it('publishes antennaUpdated only for rows returned by the deactivation update', async () => {
		const { service, publishInternalEvent } = await makeService([{ id: 'a1', isActive: false }, { id: 'a2', isActive: false }]);

		await service.process();

		// UPDATE ... RETURNING で返った行 (実際に無効化された行) だけ通知する
		expect(publishInternalEvent).toHaveBeenCalledTimes(2);
		expect(publishInternalEvent).toHaveBeenCalledWith('antennaUpdated', expect.objectContaining({ id: 'a1', isActive: false }));
		expect(publishInternalEvent).toHaveBeenCalledWith('antennaUpdated', expect.objectContaining({ id: 'a2', isActive: false }));
	});

	it('publishes nothing when no antenna was deactivated', async () => {
		const { service, publishInternalEvent } = await makeService([]);

		await service.process();

		expect(publishInternalEvent).not.toHaveBeenCalled();
	});
});
