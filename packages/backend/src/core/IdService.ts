/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { genAid, isSafeAidT, parseAid, parseAidFull } from '@/misc/id/aid.js';
import { genAidx, isSafeAidxT, parseAidx, parseAidxFull } from '@/misc/id/aidx.js';
import { genMeid, isSafeMeidT, parseMeid, parseMeidFull } from '@/misc/id/meid.js';
import { genMeidg, isSafeMeidgT, parseMeidg, parseMeidgFull } from '@/misc/id/meidg.js';
import { genObjectId, isSafeObjectIdT, parseObjectId, parseObjectIdFull } from '@/misc/id/object-id.js';
import { bindThis } from '@/decorators.js';
import { parseUlid, parseUlidFull } from '@/misc/id/ulid.js';

@Injectable()
export class IdService {
	private method: string;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		this.method = config.id.toLowerCase();
	}

	@bindThis
	public isSafeT(t: number): boolean {
		switch (this.method) {
			case 'aid': return isSafeAidT(t);
			case 'aidx': return isSafeAidxT(t);
			case 'meid': return isSafeMeidT(t);
			case 'meidg': return isSafeMeidgT(t);
			case 'ulid': return t > 0;
			case 'objectid': return isSafeObjectIdT(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * 時間を元にIDを生成します(省略時は現在日時)
	 * @param time 日時
	 */
	@bindThis
	public gen(time?: number): string {
		const t = (!time || (time > Date.now())) ? Date.now() : time;

		switch (this.method) {
			case 'aid': return genAid(t);
			case 'aidx': return genAidx(t);
			case 'meid': return genMeid(t);
			case 'meidg': return genMeidg(t);
			case 'ulid': return ulid(t);
			case 'objectid': return genObjectId(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * 指定時刻の「最小のID」を返す。
	 * gen() は同一ミリ秒でもカウンタ/乱数で値が前後するため、`gen(t)` を時刻の下限として使うと
	 * 同じミリ秒に採番されたIDを取りこぼす。ここでは時刻部分だけを最小値で埋め、
	 * それ以外を最小文字で埋めた「これ以上なら必ずその時刻以降」というIDを作る。
	 * @param time 日時
	 */
	@bindThis
	public genMinimum(time: number): string {
		switch (this.method) {
			case 'aid': {
				const t = Math.max(0, time - 946684800000);
				return t.toString(36).padStart(8, '0').slice(-8) + '00';
			}
			case 'aidx': {
				const t = Math.max(0, time - 946684800000);
				return t.toString(36).padStart(8, '0').slice(-8) + '00000000';
			}
			case 'meid': {
				const t = (time + 0x800000000000).toString(16);
				return t.padStart(12, '0') + '000000000000';
			}
			case 'meidg': {
				// meidg は先頭1文字がプレフィックス、続く11文字が時刻
				const t = time.toString(16);
				return 'g' + t.padStart(11, '0') + '000000000000';
			}
			case 'ulid': {
				const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
				let t = time;
				let out = '';
				for (let i = 0; i < 10; i++) {
					out = CHARS[t % 32] + out;
					t = Math.floor(t / 32);
				}
				return out + CHARS[0].repeat(16);
			}
			case 'objectid': {
				// objectid は秒精度なので、その秒の最小値
				const t = Math.floor(time / 1000).toString(16);
				return t.padStart(8, '0') + '0000000000000000';
			}
			default: throw new Error('unrecognized id generation method');
		}
	}

	@bindThis
	public parse(id: string): { date: Date; } {
		switch (this.method) {
			case 'aid': return parseAid(id);
			case 'aidx': return parseAidx(id);
			case 'objectid': return parseObjectId(id);
			case 'meid': return parseMeid(id);
			case 'meidg': return parseMeidg(id);
			case 'ulid': return parseUlid(id);
			default: throw new Error('unrecognized id generation method');
		}
	}

	// Note: additional is at most 64 bits
	@bindThis
	public parseFull(id: string): { date: number; additional: bigint; } {
		switch (this.method) {
			case 'aid': return parseAidFull(id);
			case 'aidx': return parseAidxFull(id);
			case 'objectid': return parseObjectIdFull(id);
			case 'meid': return parseMeidFull(id);
			case 'meidg': return parseMeidgFull(id);
			case 'ulid': return parseUlidFull(id);
			default: throw new Error('unrecognized id generation method');
		}
	}
}
