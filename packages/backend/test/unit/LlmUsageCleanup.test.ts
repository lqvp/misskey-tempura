/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test, vi } from 'vitest';
import { CleanProcessorService } from '@/queue/processors/CleanProcessorService.js';
test('cleanup rejection does not skip later existing cleanup steps', async () => {
 const logger = { info: vi.fn(), warn: vi.fn(), succ: vi.fn() };
 const ips = { delete: vi.fn() }; const contexts = { delete: vi.fn().mockResolvedValue(undefined) };
 const roles = { createQueryBuilder: () => ({ where() { return this; }, andWhere() { return this; }, getMany: async () => [] }) };
 const reversi = { cleanOutdatedGames: vi.fn() };
 const usage = { cleanup: vi.fn().mockRejectedValue(new Error('fixture')) };
 const service = new CleanProcessorService({ deactivateAntennaThreshold: 0 } as any, ips as any, {} as any, roles as any, contexts as any, { logger: { createSubLogger: () => logger } } as any, reversi as any, {} as any, usage as any);
 await service.process();
 expect(usage.cleanup).toHaveBeenCalledOnce(); expect(logger.warn).toHaveBeenCalledOnce();
 expect(ips.delete).toHaveBeenCalledOnce(); expect(contexts.delete).toHaveBeenCalledOnce(); expect(reversi.cleanOutdatedGames).toHaveBeenCalledOnce(); expect(logger.succ).toHaveBeenCalledOnce();
});
