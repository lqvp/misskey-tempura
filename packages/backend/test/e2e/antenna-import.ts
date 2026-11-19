/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import type { INestApplicationContext } from '@nestjs/common';
import * as assert from 'assert';
import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { jobQueue } from '@/boot/common.js';
import { ImportAntennasProcessorService } from '@/queue/processors/ImportAntennasProcessorService.js';
import { initTestDb, signup, successfulApiCall } from '../utils.js';
import type * as misskey from 'misskey-js';

// アンテナのimportで、createと条件が揃っているかを検証する回帰テスト。
// ImportAntennasProcessorServiceを直接実行してDBへの復元を確認する
// (i/import-antennas endpointはdrive fileをconfig.url経由で再取得するため、
// テスト環境(hostnameが解決できない)では直接呼べない)。
describe('アンテナのimport(createとの整合)', () => {
	let jq: INestApplicationContext;

	let alice: misskey.entities.SignupResponse;

	beforeAll(async () => {
		jq = await jobQueue();
		loadConfig();
		await initTestDb(false);
		alice = await signup({ username: 'alice' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await jq.close();
	});

	const baseExport = {
		caseSensitive: false,
		excludeKeywords: [[]] as string[][],
		mustExcludeKeywords: [[]] as string[][],
		name: 'import-test',
		src: 'all',
		userListAccts: null,
		users: [''],
		withFile: false,
		withReplies: false,
		excludeBots: false,
	};

	const importAndFind = async (antennas: any[], name: string) => {
		const processor = jq.get(ImportAntennasProcessorService);
		await processor.process({ data: { user: { id: alice.id }, antenna: antennas } } as any);
		const res = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
		return (res as any[]).filter((x: any) => x.name === name);
	};

	test('keywords無し・excludeKeywordsのみのアンテナがimportできること。', async () => {
		// createは「keywords か excludeKeywords のどちらかが非空」を許可しているので、
		// importも同じ条件を許可する。keywordsしか見ないと、excludeのみの正規のアンテナが黙って落ちる
		const found = await importAndFind([{
			...baseExport,
			name: 'import-exclude-only',
			keywords: [[]],
			excludeKeywords: [['sushi']],
		}], 'import-exclude-only');
		assert.strictEqual(found.length, 1, 'excludeのみのアンテナがimportされなかった');
		assert.deepStrictEqual(found[0].keywords, [[]]);
		assert.deepStrictEqual(found[0].excludeKeywords, [['sushi']]);
	});

	test('literalモードでもキーワード上限を検査すること。', async () => {
		// 上限(32グループ)を超えたアンテナは、regexモードでなくてもimportされない
		const keywords = Array.from({ length: 33 }, () => ['keyword']);
		const found = await importAndFind([{
			...baseExport,
			name: 'import-over-limit',
			keywords,
		}], 'import-over-limit');
		assert.strictEqual(found.length, 0, '上限を超えたアンテナがimportされた');
	});

	test('SCOREモードでないときはmustExcludeKeywordsを検証しないこと。', async () => {
		// create/updateと同じく、SCOREが有効なときだけmustExcludeKeywordsを見る。
		// 壊れた式が残っていてもSCOREでなければ使われないため、importをブロックしない
		const found = await importAndFind([{
			...baseExport,
			name: 'import-broken-must-exclude',
			keywords: [['tempura']],
			excludeKeywords: [[]],
			mustExcludeKeywords: [['(unclosed']],
		}], 'import-broken-must-exclude');
		assert.strictEqual(found.length, 1, 'SCOREでないのにmustExcludeKeywordsの壊れた式でimportが落ちた');
	});

	test('src=listでuserListAcctsを省略しても、以降の項目がインポートされること。', async () => {
		// userListAcctsは省略可能(undefined)。undefinedで例外が出ると、
		// 後続の項目まで巻き込んでインポートが止まる
		const found = await importAndFind([{
			...baseExport,
			name: 'import-list-no-accts',
			src: 'list',
			keywords: [['tempura']],
			excludeKeywords: [[]],
			userListAccts: undefined,
			users: ['@alice@example.com'],
		}, {
			...baseExport,
			name: 'import-after-list-no-accts',
			keywords: [['soba']],
			excludeKeywords: [[]],
		}], 'import-after-list-no-accts');
		assert.strictEqual(found.length, 1, 'src=listでuserListAccts省略時に後続項目がimportされなかった');
	});
});
