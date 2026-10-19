/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Reader } from 'mmdb-lib';
import type { Response as MmdbResponse } from 'mmdb-lib';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IpRangeSet } from '@/misc/ip-range-set.js';
import { normalizeIp } from '@/misc/ip-prefix.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { IncomingHttpHeaders } from 'node:http';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

export type IpIntel = { country: string | null; asn: number | null; asnOrg: string | null; tor: boolean; spamhausDrop: boolean; datacenter: boolean; vpn: boolean };
export type IpIntelSourceName = 'country' | 'asn' | 'tor' | 'spamhausDropV4' | 'spamhausDropV6' | 'spamhausAsnDrop' | 'datacenter' | 'vpn';
export type IpIntelSourceStatus = { name: IpIntelSourceName; loaded: boolean; version: string | null; updatedAt: string | null; entries: number | null };

type IpIntelSourceFormat = 'mmdb' | 'lines' | 'spamhausNdjson' | 'spamhausAsnNdjson';

const SAPICS_BASE = 'https://github.com/sapics/ip-location-db/releases/download';

export const IP_INTEL_SOURCES: readonly {
	name: IpIntelSourceName;
	url: string;
	fileName: string;
	format: IpIntelSourceFormat;
	/** sha256 の照合先 (sapics のみ) */
	checksumUrl?: string;
}[] = [
	{ name: 'country', url: `${SAPICS_BASE}/latest/user-country.mmdb`, fileName: 'user-country.mmdb', format: 'mmdb', checksumUrl: `${SAPICS_BASE}/checksum/user-country.mmdb.sha256` },
	{ name: 'asn', url: `${SAPICS_BASE}/latest/origin-asn.mmdb`, fileName: 'origin-asn.mmdb', format: 'mmdb', checksumUrl: `${SAPICS_BASE}/checksum/origin-asn.mmdb.sha256` },
	{ name: 'tor', url: 'https://check.torproject.org/torbulkexitlist', fileName: 'torbulkexitlist', format: 'lines' },
	{ name: 'spamhausDropV4', url: 'https://www.spamhaus.org/drop/drop_v4.json', fileName: 'spamhaus-drop_v4.json', format: 'spamhausNdjson' },
	{ name: 'spamhausDropV6', url: 'https://www.spamhaus.org/drop/drop_v6.json', fileName: 'spamhaus-drop_v6.json', format: 'spamhausNdjson' },
	{ name: 'spamhausAsnDrop', url: 'https://www.spamhaus.org/drop/asndrop.json', fileName: 'spamhaus-asndrop.json', format: 'spamhausAsnNdjson' },
	// X4BNet は datacenter / vpn ともに末尾が ipv4.txt なので接頭辞で区別する
	{ name: 'datacenter', url: 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt', fileName: 'x4bnet-datacenter-ipv4.txt', format: 'lines' },
	{ name: 'vpn', url: 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt', fileName: 'x4bnet-vpn-ipv4.txt', format: 'lines' },
];

const VERSIONS_KEY = 'loginRisk:ipdata:versions';
const DOWNLOAD_OPTIONS = { timeout: 60_000, size: 64 * 1024 * 1024 };

type CountryRecord = { country_code?: string };
type AsnRecord = { autonomous_system_number?: number; autonomous_system_organization?: string };

type ParsedSource =
	| { kind: 'mmdb'; reader: Reader<MmdbResponse>; entries: null }
	| { kind: 'ranges'; set: IpRangeSet; entries: number }
	| { kind: 'asns'; set: Set<number>; entries: number };

type LoadedSource = {
	data: ParsedSource;
	version: string;
	updatedAt: Date;
};

function sha256(buf: Buffer): string {
	return createHash('sha256').update(buf).digest('hex');
}

function isCidrOrIp(line: string): boolean {
	const slash = line.indexOf('/');
	return normalizeIp(slash < 0 ? line : line.slice(0, slash)) != null;
}

/** 壊れたデータなら例外を投げる */
function parseSource(format: IpIntelSourceFormat, buf: Buffer): ParsedSource {
	switch (format) {
		case 'mmdb': {
			return { kind: 'mmdb', reader: new Reader<MmdbResponse>(buf), entries: null };
		}
		case 'lines': {
			const cidrs = buf.toString('utf-8').split('\n')
				.map(l => l.trim())
				.filter(l => l !== '' && !l.startsWith('#') && isCidrOrIp(l));
			if (cidrs.length === 0) throw new Error('no entries');
			return { kind: 'ranges', set: IpRangeSet.fromCidrs(cidrs), entries: cidrs.length };
		}
		case 'spamhausNdjson':
		case 'spamhausAsnNdjson': {
			const cidrs: string[] = [];
			const asns = new Set<number>();
			let entries = 0;
			for (const line of buf.toString('utf-8').split('\n')) {
				if (line.trim() === '') continue;
				let obj: unknown;
				try {
					obj = JSON.parse(line);
				} catch {
					continue;
				}
				if (typeof obj !== 'object' || obj == null) continue;
				// 末尾のメタデータ行には cidr / asn が無いので読み飛ばす
				if (format === 'spamhausNdjson') {
					const cidr = (obj as { cidr?: unknown }).cidr;
					if (typeof cidr !== 'string' || !isCidrOrIp(cidr)) continue;
					cidrs.push(cidr);
				} else {
					const asn = (obj as { asn?: unknown }).asn;
					if (typeof asn !== 'number' || !Number.isInteger(asn)) continue;
					asns.add(asn);
				}
				entries++;
			}
			if (entries === 0) throw new Error('no entries');
			return format === 'spamhausNdjson'
				? { kind: 'ranges', set: IpRangeSet.fromCidrs(cidrs), entries }
				: { kind: 'asns', set: asns, entries };
		}
	}
}

const COUNTRY_HEADER_RE = /^[A-Z]{2}$/;

@Injectable()
export class IpIntelligenceService implements OnModuleInit, OnApplicationShutdown {
	private logger: Logger;
	private sources = new Map<IpIntelSourceName, LoadedSource>();
	/** 更新処理を直列化する */
	private running: Promise<void> = Promise.resolve();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		private httpRequestService: HttpRequestService,
		private globalEventService: GlobalEventService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('ip-intelligence');
		this.redisForSub.on('message', this.onMessage);
	}

	/** 起動時はファイルを読むだけで、ネットワークには出ない */
	public async onModuleInit(): Promise<void> {
		await this.serialize(() => this.loadAllFromDisk());

		if (process.env.NODE_ENV !== 'test') {
			// 他のプロセスが更新した版に追いつく。起動は待たせない
			this.syncWithRemoteVersions().catch(err => {
				this.logger.warn(`failed to sync ip data: ${err}`);
			});
		}
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type } = obj.message as GlobalEvents['internal']['payload'];
			if (type === 'ipIntelligenceUpdated') {
				this.syncWithRemoteVersions().catch(err => {
					this.logger.warn(`failed to sync ip data: ${err}`);
				});
			}
		}
	}

	@bindThis
	public lookup(ip: string, headers: IncomingHttpHeaders): IpIntel {
		const intel: IpIntel = { country: null, asn: null, asnOrg: null, tor: false, spamhausDrop: false, datacenter: false, vpn: false };

		try {
			const normalized = normalizeIp(ip);
			if (normalized != null) {
				const country = this.getReader('country')?.get(normalized) as CountryRecord | null | undefined;
				if (typeof country?.country_code === 'string') intel.country = country.country_code;

				const asn = this.getReader('asn')?.get(normalized) as AsnRecord | null | undefined;
				if (typeof asn?.autonomous_system_number === 'number') intel.asn = asn.autonomous_system_number;
				if (typeof asn?.autonomous_system_organization === 'string') intel.asnOrg = asn.autonomous_system_organization;

				intel.tor = this.inRanges('tor', normalized);
				intel.spamhausDrop = this.inRanges('spamhausDropV4', normalized)
					|| this.inRanges('spamhausDropV6', normalized)
					|| (intel.asn != null && this.inAsns('spamhausAsnDrop', intel.asn));
				intel.datacenter = this.inRanges('datacenter', normalized);
				intel.vpn = this.inRanges('vpn', normalized);
			}

			if (this.config.loginRisk.trustCloudflareHeaders) {
				const cf = headers['cf-ipcountry'];
				if (typeof cf === 'string' && COUNTRY_HEADER_RE.test(cf) && cf !== 'XX' && cf !== 'T1') {
					intel.country = cf;
				}
			}
		} catch (err) {
			this.logger.warn(`lookup failed for ${ip}: ${err}`);
		}

		return intel;
	}

	/** 日次ジョブから呼ぶ。取得→検証→保存→Redis に版を記録→全プロセスへ通知 */
	@bindThis
	public updateAll(): Promise<void> {
		return this.serialize(async () => {
			if (!this.config.loginRisk.autoUpdate) {
				await this.loadAllFromDisk();
				return;
			}

			const failed: IpIntelSourceName[] = [];
			for (const source of IP_INTEL_SOURCES) {
				try {
					const loaded = await this.downloadAndApply(source);
					await this.redisClient.hset(VERSIONS_KEY, source.name, `${loaded.version}|${loaded.updatedAt.toISOString()}`);
				} catch (err) {
					failed.push(source.name);
					this.logger.warn(`failed to update ${source.name}, keeping the current data: ${err}`);
				}
			}

			this.globalEventService.publishInternalEvent('ipIntelligenceUpdated', {});

			if (failed.length > 0) {
				throw new Error(`failed to update ip data: ${failed.join(', ')}`);
			}
		});
	}

	/** 起動時と ipIntelligenceUpdated の受信時に呼ぶ。手元の版が Redis の版と違えば取り直す */
	@bindThis
	public syncWithRemoteVersions(): Promise<void> {
		return this.serialize(async () => {
			const remote = await this.redisClient.hgetall(VERSIONS_KEY);

			for (const source of IP_INTEL_SOURCES) {
				const record = remote[source.name];
				if (record == null) continue;
				const remoteVersion = record.split('|')[0];
				if (this.sources.get(source.name)?.version === remoteVersion) continue;

				try {
					// 保存先を共有している構成では、ファイルがすでに新しい版になっている
					await this.loadFromDisk(source);
					if (this.sources.get(source.name)?.version === remoteVersion) continue;
					if (!this.config.loginRisk.autoUpdate) continue;

					await this.downloadAndApply(source);
				} catch (err) {
					this.logger.warn(`failed to sync ${source.name}, keeping the current data: ${err}`);
				}
			}
		});
	}

	@bindThis
	public getStatus(): IpIntelSourceStatus[] {
		return IP_INTEL_SOURCES.map(source => {
			const loaded = this.sources.get(source.name);
			return {
				name: source.name,
				loaded: loaded != null,
				version: loaded?.version ?? null,
				updatedAt: loaded?.updatedAt.toISOString() ?? null,
				entries: loaded?.data.entries ?? null,
			};
		});
	}

	/** テスト用: Buffer やテキストを直接読み込む */
	@bindThis
	public loadFromBuffers(data: Partial<Record<IpIntelSourceName, Buffer>>): void {
		for (const source of IP_INTEL_SOURCES) {
			const buf = data[source.name];
			if (buf == null) continue;
			try {
				this.apply(source, buf, new Date());
			} catch (err) {
				this.logger.warn(`failed to load ${source.name}: ${err}`);
			}
		}
	}

	private serialize(fn: () => Promise<void>): Promise<void> {
		const next = this.running.then(fn);
		this.running = next.catch(() => {});
		return next;
	}

	private getReader(name: 'country' | 'asn'): Reader<MmdbResponse> | null {
		const data = this.sources.get(name)?.data;
		return data?.kind === 'mmdb' ? data.reader : null;
	}

	private inRanges(name: IpIntelSourceName, ip: string): boolean {
		const data = this.sources.get(name)?.data;
		return data?.kind === 'ranges' ? data.set.has(ip) : false;
	}

	private inAsns(name: IpIntelSourceName, asn: number): boolean {
		const data = this.sources.get(name)?.data;
		return data?.kind === 'asns' ? data.set.has(asn) : false;
	}

	/** 解析に失敗したら例外を投げ、今のデータはそのまま残す */
	private apply(source: typeof IP_INTEL_SOURCES[number], buf: Buffer, updatedAt: Date): LoadedSource {
		const loaded = { data: parseSource(source.format, buf), version: sha256(buf), updatedAt };
		this.sources.set(source.name, loaded);
		return loaded;
	}

	private async loadAllFromDisk(): Promise<void> {
		for (const source of IP_INTEL_SOURCES) {
			try {
				await this.loadFromDisk(source);
			} catch (err) {
				this.logger.warn(`failed to load ${source.fileName}: ${err}`);
			}
		}
	}

	/** ファイルが無ければ何もしない */
	private async loadFromDisk(source: typeof IP_INTEL_SOURCES[number]): Promise<void> {
		const path = join(this.config.loginRisk.dataDir, source.fileName);
		let buf: Buffer;
		let mtime: Date;
		try {
			[buf, mtime] = await Promise.all([fs.readFile(path), fs.stat(path).then(s => s.mtime)]);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
			throw err;
		}
		if (this.sources.get(source.name)?.version === sha256(buf)) return;
		this.apply(source, buf, mtime);
	}

	private async download(url: string): Promise<Buffer> {
		const res = await this.httpRequestService.send(url, DOWNLOAD_OPTIONS);
		return Buffer.from(await res.arrayBuffer());
	}

	private async downloadAndApply(source: typeof IP_INTEL_SOURCES[number]): Promise<LoadedSource> {
		const buf = await this.download(source.url);

		if (source.checksumUrl) {
			const expected = (await this.download(source.checksumUrl)).toString('utf-8').trim().split(/\s+/)[0].toLowerCase();
			const actual = sha256(buf);
			if (expected !== actual) throw new Error(`sha256 mismatch (expected ${expected}, got ${actual})`);
		}

		// 検証を通ったものだけを保存・反映する
		const loaded = this.apply(source, buf, new Date());
		await this.save(source.fileName, buf);
		return loaded;
	}

	/** 一時ファイルに書いてから rename する。書けなければメモリにだけ持つ */
	private async save(fileName: string, buf: Buffer): Promise<void> {
		const dir = this.config.loginRisk.dataDir;
		const tmp = join(dir, `.${fileName}.${randomUUID()}.tmp`);
		try {
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(tmp, buf);
			await fs.rename(tmp, join(dir, fileName));
		} catch (err) {
			this.logger.warn(`cannot write ${fileName} to ${dir}, keeping it in memory only: ${err}`);
			await fs.rm(tmp, { force: true }).catch(() => {});
		}
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.redisForSub.off('message', this.onMessage);
	}
}
