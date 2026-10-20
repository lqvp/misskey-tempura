/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { UpdateIpIntelligenceProcessorService } from '@/queue/processors/UpdateIpIntelligenceProcessorService.js';

function setup(opts: { enabled: boolean; autoUpdate?: boolean; loaded?: boolean }) {
	const logger = { info: vi.fn(), succ: vi.fn(), warn: vi.fn() };
	const ipIntelligenceService = {
		updateAll: vi.fn(async () => {}),
		getStatus: vi.fn(() => [{ name: 'country', loaded: opts.loaded ?? false, version: null, updatedAt: null, entries: null }]),
	};
	const queueService = { systemQueue: { add: vi.fn(async () => {}) } };
	const service = new UpdateIpIntelligenceProcessorService(
		{ loginRisk: { autoUpdate: opts.autoUpdate ?? true } } as any,
		{ enableLoginRiskDetection: opts.enabled } as any,
		ipIntelligenceService as any,
		queueService as any,
		{ logger: { createSubLogger: () => logger } } as any,
	);
	return { service, ipIntelligenceService, queueService };
}

describe('UpdateIpIntelligenceProcessorService', () => {
	test('process: skips network work when the feature is disabled', async () => {
		const { service, ipIntelligenceService } = setup({ enabled: false });
		await service.process();
		expect(ipIntelligenceService.updateAll).not.toHaveBeenCalled();
	});

	test('process: updates when the feature is enabled', async () => {
		const { service, ipIntelligenceService } = setup({ enabled: true });
		await service.process();
		expect(ipIntelligenceService.updateAll).toHaveBeenCalledTimes(1);
	});

	test('boot: enqueues a one-shot job when enabled, autoUpdate and nothing loaded', async () => {
		const { service, queueService } = setup({ enabled: true });
		await service.onApplicationBootstrap();
		expect(queueService.systemQueue.add).toHaveBeenCalledWith('updateIpIntelligence', {}, expect.objectContaining({ jobId: 'updateIpIntelligence-oneshot' }));
	});

	test.each([
		['disabled', { enabled: false }],
		['autoUpdate off', { enabled: true, autoUpdate: false }],
		['already loaded', { enabled: true, loaded: true }],
	])('boot: does not enqueue when %s', async (_, opts) => {
		const { service, queueService } = setup(opts);
		await service.onApplicationBootstrap();
		expect(queueService.systemQueue.add).not.toHaveBeenCalled();
	});
});
