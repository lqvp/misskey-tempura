/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { genAid, parseAid } from '@/misc/id/aid.js';
import { genAidx, parseAidx } from '@/misc/id/aidx.js';
import { genMeid, parseMeid } from '@/misc/id/meid.js';
import { genMeidg, parseMeidg } from '@/misc/id/meidg.js';
import { genObjectId, parseObjectId } from '@/misc/id/object-id.js';
import { parseUlid } from '@/misc/id/ulid.js';
import { ulid } from 'ulid';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';

/**
 * アンテナのTL補完は「アンテナ作成時刻以降のノート」を `note.id >= createdId` で絞り込む。
 * その境界が ID 形式ごとに正しく「同じミリ秒を含み、前のミリ秒を除外」できることを固定する。
 */
function makeIdService(method: string): IdService {
	return new IdService({ id: method } as Config);
}

const formats = [
	{ name: 'aid', gen: genAid, parse: parseAid },
	{ name: 'aidx', gen: genAidx, parse: parseAidx },
	{ name: 'meid', gen: genMeid, parse: parseMeid },
	{ name: 'meidg', gen: genMeidg, parse: parseMeidg },
	{ name: 'ulid', gen: (t: number) => ulid(t), parse: parseUlid },
	{ name: 'objectid', gen: genObjectId, parse: parseObjectId },
] as const;

describe('IdService.genMinimum', () => {
	for (const format of formats) {
		it(`${format.name}: 同じミリ秒のIDをすべて含み、前のミリ秒を除外する`, () => {
			const idService = makeIdService(format.name);
			// IdService がその形式として id を解釈できることを確認する
			expect(idService.parse(format.gen(1700000000000)).date.getTime()).toBe(1700000000000);

			const time = Date.now();
			const minimum = idService.genMinimum(time);

			// 同じミリ秒に採番したIDは必ず境界以上になる
			for (let i = 0; i < 500; i++) {
				expect(format.gen(time) >= minimum).toBe(true);
			}

			// 前のミリ秒のIDは境界より小さい。
			// objectid は秒精度なので、同じ秒に属する「前のミリ秒」も境界に含まれる
			if (format.name === 'objectid') {
				expect(format.gen(time - 1000) < minimum).toBe(true);
			} else {
				expect(format.gen(time - 1) < minimum).toBe(true);
			}
		});
	}

	it('小数・負値・非数の時刻でも妥当なIDを返す', () => {
		// 境界の計算に不正な値が入っても、id として解釈できない文字を混ぜない
		const expectedLength: Record<string, number> = {
			aid: 10, aidx: 16, meid: 24, meidg: 24, ulid: 26, objectid: 24,
		};
		for (const format of formats) {
			const idService = makeIdService(format.name);
			for (const time of [1700000000123.456, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
				const id = idService.genMinimum(time);
				expect(id).toHaveLength(expectedLength[format.name]);
				// id として parse できること (形式に合わない文字が混ざっていない)
				expect(Number.isNaN(idService.parse(id).date.getTime())).toBe(false);
			}
		}
	});

	it('未知の形式では例外を投げる', () => {
		const idService = makeIdService('unknown');
		expect(() => idService.genMinimum(Date.now())).toThrow();
	});
});
