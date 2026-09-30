/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { createServer } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { connect, Socket } from 'node:net';
import type { ConnectionOptions, PeerCertificate } from 'node:tls';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DownloadService } from '@/core/DownloadService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { resolveRemoteUrl, validateRemoteUrl } from '@/misc/validate-remote-url.js';
import type { Config } from '@/config.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const dnsLookup = vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>);
const config = { allowedPrivateNetworks: [], maxFileSize: 1024, userAgent: 'test' } as unknown as Config;
const logger = { info: vi.fn(), warn: vi.fn(), succ: vi.fn() };

afterEach(() => vi.resetAllMocks());

describe('remote URL resolution', () => {
	test.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('rejects DNS resolving to %s', async address => {
		dnsLookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
		expect(await validateRemoteUrl('https://storage.example/image', config)).toBe(false);
	});

	test('rejects mixed public/private answers and DNS failures', async () => {
		dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
		expect(await validateRemoteUrl('https://storage.example/image', config)).toBe(false);
		dnsLookup.mockRejectedValue(new Error('ENOTFOUND'));
		expect(await validateRemoteUrl('https://storage.example/image', config)).toBe(false);
	});

	test('bounds DNS resolution time', async () => {
		vi.useFakeTimers();
		try {
			dnsLookup.mockReturnValue(new Promise(() => {}));
			const result = validateRemoteUrl('https://storage.example/image', config);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(await result).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	test.each(['file:///etc/passwd', 'http://user:pass@storage.example', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/'])('rejects %s without DNS', async url => {
		expect(await validateRemoteUrl(url, config)).toBe(false);
		expect(dnsLookup).not.toHaveBeenCalled();
	});

	test('accepts public addresses and explicit private-network exceptions', async () => {
		dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		expect(await resolveRemoteUrl('https://storage.example/image', config)).toEqual({ address: '93.184.216.34', family: 4 });
		expect(await validateRemoteUrl('http://10.0.0.1/', { ...config, allowedPrivateNetworks: ['10.0.0.0/8'] })).toBe(true);
	});
});

describe('download connection pinning', () => {
	test('preserves HTTPS server name and certificate identity while pinning the address', () => {
		const socket = new Socket();
		const createConnection = vi.spyOn(HttpsAgent.prototype, 'createConnection').mockReturnValue(socket);
		const agent = new HttpRequestService(config).getAgentForPinnedUrl(new URL('https://storage.example/image'), '93.184.216.34');
		try {
			agent.createConnection({ host: 'storage.example', port: 443 }, () => {});
			const options = createConnection.mock.calls[0][0] as ConnectionOptions;
			expect(options.host).toBe('93.184.216.34');
			expect(options.servername).toBe('storage.example');
			expect(options.checkServerIdentity!('93.184.216.34', { subjectaltname: 'DNS:storage.example' } as PeerCertificate)).toBeUndefined();
			expect(options.checkServerIdentity!('93.184.216.34', { subjectaltname: 'DNS:wrong.example' } as PeerCertificate)).toBeInstanceOf(Error);
		} finally {
			agent.destroy();
			socket.destroy();
		}
	});

	test.each([false, true])('pins DNS and validates each redirect (proxy=%s)', async useProxy => {
		const requests: string[] = [];
		const hosts: string[] = [];
		const server = createServer((request, response) => {
			requests.push(request.url!);
			hosts.push(request.headers.host!);
			if (request.url === '/start') {
				response.writeHead(302, { location: '/image' });
			} else if (request.url === '/blocked') {
				response.writeHead(302, { location: 'http://blocked.example/secret' });
			} else if (request.url === '/literal') {
				response.writeHead(302, { location: 'http://169.254.169.254/secret' });
			}
			response.end('image');
		});
		const proxyTargets: string[] = [];
		const proxy = createServer();
		proxy.on('connect', (request, socket, head) => {
			proxyTargets.push(request.url!);
			const [host, port] = request.url!.split(':');
			const upstream = connect(Number(port), host, () => {
				socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				socket.pipe(upstream).pipe(socket);
			});
			socket.on('close', () => upstream.destroy());
			upstream.on('error', () => socket.destroy());
		});
		const dir = await mkdtemp(join(tmpdir(), 'misskey-download-'));
		try {
			server.listen(0, '127.0.0.1');
			await once(server, 'listening');
			proxy.listen(0, '127.0.0.1');
			await once(proxy, 'listening');
			const port = (server.address() as import('node:net').AddressInfo).port;
			const proxyPort = (proxy.address() as import('node:net').AddressInfo).port;
			const testConfig = { ...config, allowedPrivateNetworks: ['127.0.0.1/32'], proxy: useProxy ? `http://127.0.0.1:${proxyPort}` : undefined };
			const service = new DownloadService(testConfig, new HttpRequestService(testConfig), { getLogger: () => logger } as any);
			// The hostname cannot resolve through the OS; only the validated address can connect.
			dnsLookup.mockImplementation(async hostname => [{ address: hostname === 'blocked.example' ? '10.0.0.1' : '127.0.0.1', family: 4 }]);
			await service.downloadUrl(`http://storage.invalid:${port}/start`, join(dir, 'image'));
			expect(await readFile(join(dir, 'image'), 'utf8')).toBe('image');
			expect(requests).toEqual(['/start', '/image']);
			expect(hosts).toEqual([`storage.invalid:${port}`, `storage.invalid:${port}`]);
			expect(dnsLookup).toHaveBeenCalledTimes(2);
			await expect(service.downloadUrl(`http://storage.invalid:${port}/blocked`, join(dir, 'blocked'))).rejects.toThrow('Invalid remote URL');
			await expect(service.downloadUrl(`http://storage.invalid:${port}/literal`, join(dir, 'literal'))).rejects.toThrow('Invalid remote URL');
			expect(requests).toEqual(['/start', '/image', '/blocked', '/literal']);
			dnsLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
			await expect(service.downloadUrl(`http://storage.invalid:${port}/start`, join(dir, 'rebound'))).rejects.toThrow('Invalid remote URL');
			expect(requests).toEqual(['/start', '/image', '/blocked', '/literal', '/start']);
			if (useProxy) expect(proxyTargets).toEqual(Array(5).fill(`127.0.0.1:${port}`));
		} finally {
			server.closeAllConnections();
			proxy.closeAllConnections();
			await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => proxy.close(() => resolve()))]);
			await rm(dir, { recursive: true, force: true });
		}
	});
});
