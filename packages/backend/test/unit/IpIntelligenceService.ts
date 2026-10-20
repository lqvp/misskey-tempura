/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as Redis from 'ioredis';
import type { Mocked } from 'vitest';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { IpIntelligenceService, IP_INTEL_SOURCES } from '@/core/IpIntelligenceService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';

const baseConfig = loadConfig();

const VERSIONS_KEY = 'loginRisk:ipdata:versions';

const EMPTY_INTEL = { country: null, asn: null, asnOrg: null, tor: false, spamhausDrop: false, datacenter: false, vpn: false };

async function createService(loginRisk: Partial<Config['loginRisk']>) {
	const app = await Test.createTestingModule({
		imports: [GlobalModule],
		providers: [
			IpIntelligenceService,
			LoggerService,
			{ provide: HttpRequestService, useFactory: () => ({ send: vi.fn() }) },
			{ provide: GlobalEventService, useFactory: () => ({ publishInternalEvent: vi.fn() }) },
		],
	})
		.overrideProvider(DI.config)
		.useValue({ ...baseConfig, loginRisk: { ...baseConfig.loginRisk, ...loginRisk } } satisfies Config)
		.compile();
	await app.init();
	app.enableShutdownHooks();
	return app;
}

describe('IpIntelligenceService', () => {
	let tmpDir: string;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'ipintel-test-'));
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe('lookup', () => {
		let app: TestingModule;
		let svc: IpIntelligenceService;

		beforeAll(async () => {
			app = await createService({ dataDir: join(tmpDir, 'empty'), trustCloudflareHeaders: false });
			svc = app.get(IpIntelligenceService);
			svc.loadFromBuffers({
				tor: Buffer.from('171.25.193.25\n'),
				spamhausDropV4: Buffer.from('{"cidr":"1.10.16.0/20","sblid":"SBL1","rir":"apnic"}\n{"type":"metadata","timestamp":1}\n'),
				spamhausAsnDrop: Buffer.from('{"asn":64500,"rir":"arin"}\n'),
				datacenter: Buffer.from('198.51.100.0/24\n'),
			});
		});

		afterAll(async () => {
			await app.close();
		});

		test('matches loaded lists', () => {
			expect(svc.lookup('171.25.193.25', {}).tor).toBe(true);
			expect(svc.lookup('1.10.20.1', {}).spamhausDrop).toBe(true);
			expect(svc.lookup('198.51.100.9', {}).datacenter).toBe(true);
			expect(svc.lookup('::ffff:171.25.193.25', {}).tor).toBe(true);
		});

		test('unknown without mmdb', () => {
			expect(svc.lookup('203.0.113.1', {})).toEqual(EMPTY_INTEL);
		});

		test('invalid ip does not throw', () => {
			expect(svc.lookup('not an ip', {})).toEqual(EMPTY_INTEL);
		});

		test('broken mmdb is ignored', () => {
			expect(() => svc.loadFromBuffers({ country: Buffer.from('not a mmdb') })).not.toThrow();
			expect(svc.lookup('203.0.113.1', {}).country).toBeNull();
			expect(svc.getStatus().find(s => s.name === 'country')!.loaded).toBe(false);
		});

		test('cf-ipcountry is ignored by default', () => {
			expect(svc.lookup('203.0.113.1', { 'cf-ipcountry': 'JP' }).country).toBeNull();
		});

		test('status reports list entries', () => {
			const status = svc.getStatus();
			expect(status.map(s => s.name)).toEqual(IP_INTEL_SOURCES.map(s => s.name));
			const tor = status.find(s => s.name === 'tor')!;
			expect(tor.loaded).toBe(true);
			expect(tor.entries).toBe(1);
			expect(tor.version).toBe(createHash('sha256').update('171.25.193.25\n').digest('hex'));
			expect(status.find(s => s.name === 'spamhausDropV4')!.entries).toBe(1);
			expect(status.find(s => s.name === 'vpn')!.loaded).toBe(false);
		});
	});

	describe('trustCloudflareHeaders', () => {
		let app: TestingModule;
		let svc: IpIntelligenceService;

		beforeAll(async () => {
			app = await createService({ dataDir: join(tmpDir, 'empty'), trustCloudflareHeaders: true });
			svc = app.get(IpIntelligenceService);
		});

		afterAll(async () => {
			await app.close();
		});

		test('uses cf-ipcountry when trusted', () => {
			expect(svc.lookup('203.0.113.1', { 'cf-ipcountry': 'JP' }).country).toBe('JP');
			expect(svc.lookup('203.0.113.1', { 'cf-ipcountry': 'XX' }).country).toBeNull();
			expect(svc.lookup('203.0.113.1', { 'cf-ipcountry': 'T1' }).country).toBeNull();
			expect(svc.lookup('203.0.113.1', { 'cf-ipcountry': 'jp' }).country).toBeNull();
		});
	});

	describe('autoUpdate=false', () => {
		let app: TestingModule;
		let svc: IpIntelligenceService;
		let http: Mocked<HttpRequestService>;
		let events: Mocked<GlobalEventService>;
		let dataDir: string;

		beforeAll(async () => {
			dataDir = join(tmpDir, 'offline');
			fs.mkdirSync(dataDir, { recursive: true });
			app = await createService({ dataDir, autoUpdate: false });
			svc = app.get(IpIntelligenceService);
			http = app.get(HttpRequestService) as Mocked<HttpRequestService>;
			events = app.get(GlobalEventService) as Mocked<GlobalEventService>;
		});

		afterAll(async () => {
			await app.close();
		});

		test('sync reloads files placed by the admin without downloading', async () => {
			expect(svc.lookup('171.25.193.25', {}).tor).toBe(false);
			fs.writeFileSync(join(dataDir, 'torbulkexitlist'), '171.25.193.25\n');

			await svc.syncWithRemoteVersions();

			expect(svc.lookup('171.25.193.25', {}).tor).toBe(true);
			expect(http.send).not.toHaveBeenCalled();
		});

		test('updateAll reloads files and notifies other processes without downloading', async () => {
			fs.writeFileSync(join(dataDir, 'x4bnet-vpn-ipv4.txt'), '192.0.2.0/24\n');

			await svc.updateAll();

			expect(svc.lookup('192.0.2.1', {}).vpn).toBe(true);
			expect(http.send).not.toHaveBeenCalled();
			expect(events.publishInternalEvent).toHaveBeenCalledWith('ipIntelligenceUpdated', {});
		});
	});

	describe('ipIntelligenceUpdated event', () => {
		const message = JSON.stringify({ channel: 'internal', message: { type: 'ipIntelligenceUpdated', body: {} } });

		test('does not sync while the feature is disabled, and syncs once it is enabled', async () => {
			const app = await createService({ dataDir: join(tmpDir, 'event'), autoUpdate: true });
			const meta = app.get(DI.meta) as { enableLoginRiskDetection: boolean };
			const original = meta.enableLoginRiskDetection;
			try {
				const svc = app.get(IpIntelligenceService);
				const sync = vi.spyOn(svc, 'syncWithRemoteVersions').mockResolvedValue();
				const redisForSub = app.get(DI.redisForSub) as Redis.Redis;

				meta.enableLoginRiskDetection = false;
				redisForSub.emit('message', 'internal', message);
				expect(sync).not.toHaveBeenCalled();

				meta.enableLoginRiskDetection = true;
				redisForSub.emit('message', 'internal', message);
				expect(sync).toHaveBeenCalledTimes(1);
			} finally {
				meta.enableLoginRiskDetection = original;
				await app.close();
			}
		});
	});

	describe('updateAll', () => {
		let app: TestingModule;
		let svc: IpIntelligenceService;
		let http: Mocked<HttpRequestService>;
		let events: Mocked<GlobalEventService>;
		let redis: Redis.Redis;
		let dataDir: string;

		const bodies: Record<string, string> = {
			'https://check.torproject.org/torbulkexitlist': '171.25.193.25\n',
			'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt': '198.51.100.0/24\n',
		};

		beforeAll(async () => {
			dataDir = join(tmpDir, 'update');
			app = await createService({ dataDir, autoUpdate: true });
			svc = app.get(IpIntelligenceService);
			http = app.get(HttpRequestService) as Mocked<HttpRequestService>;
			events = app.get(GlobalEventService) as Mocked<GlobalEventService>;
			redis = app.get(DI.redis);
		});

		beforeEach(async () => {
			await redis.del(VERSIONS_KEY);
			http.send.mockReset();
			http.send.mockImplementation(async (url: string) => {
				if (url.endsWith('.sha256')) {
					// mmdb に対しては一致しないハッシュを返す
					return { arrayBuffer: async () => new TextEncoder().encode('0'.repeat(64) + '  file\n').buffer } as any;
				}
				const body = bodies[url];
				if (body == null) throw new Error('404');
				return { arrayBuffer: async () => new TextEncoder().encode(body).buffer } as any;
			});
		});

		afterAll(async () => {
			await redis.del(VERSIONS_KEY);
			await app.close();
		});

		test('downloads, saves, records versions and notifies', async () => {
			await expect(svc.updateAll()).rejects.toThrow();

			expect(fs.readFileSync(join(dataDir, 'torbulkexitlist'), 'utf-8')).toBe('171.25.193.25\n');
			expect(fs.readFileSync(join(dataDir, 'x4bnet-datacenter-ipv4.txt'), 'utf-8').length).toBeGreaterThan(0);
			expect(svc.lookup('171.25.193.25', {}).tor).toBe(true);
			expect(svc.lookup('198.51.100.1', {}).datacenter).toBe(true);

			const versions = await redis.hgetall(VERSIONS_KEY);
			const torSha = createHash('sha256').update('171.25.193.25\n').digest('hex');
			expect(versions.tor.split('|')[0]).toBe(torSha);
			// 検証に失敗した mmdb と取得できなかったソースは記録しない
			expect(versions.country).toBeUndefined();
			expect(versions.spamhausDropV4).toBeUndefined();
			expect(fs.existsSync(join(dataDir, 'user-country.mmdb'))).toBe(false);

			expect(events.publishInternalEvent).toHaveBeenCalledWith('ipIntelligenceUpdated', {});
		});

		test('keeps data in memory when dataDir is not writable', async () => {
			const notADir = join(tmpDir, 'not-a-dir');
			fs.writeFileSync(notADir, '');
			const app2 = await createService({ dataDir: notADir, autoUpdate: true });
			const http2 = app2.get(HttpRequestService) as Mocked<HttpRequestService>;
			http2.send.mockImplementation(http.send.getMockImplementation()!);
			try {
				const svc2 = app2.get(IpIntelligenceService);
				await expect(svc2.updateAll()).rejects.toThrow();
				expect(svc2.lookup('171.25.193.25', {}).tor).toBe(true);
			} finally {
				await app2.close();
			}
		});

		test('sync reloads from disk when the local version is stale', async () => {
			const list = '192.0.2.0/24\n';
			fs.writeFileSync(join(dataDir, 'x4bnet-datacenter-ipv4.txt'), list);
			await redis.hset(VERSIONS_KEY, 'datacenter', `${createHash('sha256').update(list).digest('hex')}|${new Date().toISOString()}`);

			await svc.syncWithRemoteVersions();

			expect(http.send).not.toHaveBeenCalled();
			expect(svc.lookup('192.0.2.1', {}).datacenter).toBe(true);
		});

		test('sync downloads the data when the local file is broken', async () => {
			const brokenDir = join(tmpDir, 'broken');
			fs.mkdirSync(brokenDir, { recursive: true });
			fs.writeFileSync(join(brokenDir, 'torbulkexitlist'), 'garbage\n');
			const good = bodies['https://check.torproject.org/torbulkexitlist'];
			await redis.hset(VERSIONS_KEY, 'tor', `${createHash('sha256').update(good).digest('hex')}|${new Date().toISOString()}`);

			const app3 = await createService({ dataDir: brokenDir, autoUpdate: true });
			const http3 = app3.get(HttpRequestService) as Mocked<HttpRequestService>;
			http3.send.mockImplementation(http.send.getMockImplementation()!);
			try {
				const svc3 = app3.get(IpIntelligenceService);
				await svc3.syncWithRemoteVersions();

				expect(http3.send).toHaveBeenCalledWith('https://check.torproject.org/torbulkexitlist', expect.anything());
				expect(svc3.lookup('171.25.193.25', {}).tor).toBe(true);
				expect(fs.readFileSync(join(brokenDir, 'torbulkexitlist'), 'utf-8')).toBe(good);
			} finally {
				await app3.close();
			}
		});
	});
});
