/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import type { INestApplicationContext } from '@nestjs/common';
import * as assert from 'assert';
import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { jobQueue } from '@/boot/common.js';
import { ImportAntennasProcessorService } from '@/queue/processors/ImportAntennasProcessorService.js';
import { api, initTestDb, port, post, signup, successfulApiCall } from '../utils.js';
import type * as misskey from 'misskey-js';

// アンテナのregexモードで、空白・改行を含むパターンが
// 保存(API→DB→API)・export→importの往復で一字も変わらず保持され、
// マッチでも空白・改行が意味を持つことを確認する回帰テスト。
describe('アンテナregexモードの空白・改行保持(往復)', () => {
	let jq: INestApplicationContext;

	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	const baseParam = {
		caseSensitive: false,
		excludeKeywords: [[]] as string[][],
		mustExcludeKeywords: [[]] as string[][],
		name: 'whitespace-roundtrip',
		src: 'all' as const,
		userListId: null,
		users: [''],
		withFile: false,
		withReplies: false,
		excludeBots: false,
		keywordMode: 'regex' as const,
	};

	const waitOptions = { timeout: 15000, interval: 100 };

	beforeAll(async () => {
		jq = await jobQueue();
		loadConfig();
		await initTestDb(false);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await jq.close();
	});

	test('前後空白・改行を含むパターンがcreate→showで同一に保持されること。', async () => {
		const keywords = [[' りんご[0-9]+ 円 ', '円\n次']];
		const excludeKeywords = [[' 除外 ']];
		const mustExcludeKeywords = [['\tタブ']];

		const created = await successfulApiCall({
			endpoint: 'antennas/create',
			parameters: { ...baseParam, keywords, excludeKeywords, mustExcludeKeywords },
			user: alice,
		});
		assert.deepStrictEqual(created.keywords, keywords);
		assert.deepStrictEqual(created.excludeKeywords, excludeKeywords);
		assert.deepStrictEqual(created.mustExcludeKeywords, mustExcludeKeywords);

		const shown = await successfulApiCall({
			endpoint: 'antennas/show',
			parameters: { antennaId: created.id },
			user: alice,
		});
		assert.deepStrictEqual(shown.keywords, keywords);
		assert.deepStrictEqual(shown.excludeKeywords, excludeKeywords);
		assert.deepStrictEqual(shown.mustExcludeKeywords, mustExcludeKeywords);

		// updateでもtrimされないこと
		const updatedKeywords = [['\n先頭改行と末尾空白 ']];
		const updated = await successfulApiCall({
			endpoint: 'antennas/update',
			parameters: { ...baseParam, antennaId: created.id, keywords: updatedKeywords },
			user: alice,
		});
		assert.deepStrictEqual(updated.keywords, updatedKeywords);
	});

	test('マッチで空白・改行が意味を持つこと。', async () => {
		await post(bob, { text: 'スーパーで りんご100 円 だった' });
		await post(bob, { text: 'りんご100円だった' }); // 空白なしはマッチしない
		await post(bob, { text: '100円\n次へ進む' });
		await post(bob, { text: '100円 次へ進む' }); // 改行でなく空白はマッチしない

		const withSpaces = await successfulApiCall({
			endpoint: 'antennas/test',
			parameters: { ...baseParam, keywords: [[' りんご[0-9]+ 円 ']] },
			user: alice,
		});
		assert.ok(withSpaces.some((x: misskey.entities.Note) => x.text === 'スーパーで りんご100 円 だった'));
		assert.ok(!withSpaces.some((x: misskey.entities.Note) => x.text === 'りんご100円だった'));

		const withNewline = await successfulApiCall({
			endpoint: 'antennas/test',
			parameters: { ...baseParam, keywords: [['円\n次']] },
			user: alice,
		});
		assert.ok(withNewline.some((x: misskey.entities.Note) => x.text === '100円\n次へ進む'));
		assert.ok(!withNewline.some((x: misskey.entities.Note) => x.text === '100円 次へ進む'));
	});

	test('export→importの往復でパターンが同一に保持されること。', async () => {
		const keywords = [[' りんご[0-9]+ 円 ', '円\n次']];
		const excludeKeywords = [[' 除外 ']];
		const mustExcludeKeywords = [['\tタブ']];

		const created = await successfulApiCall({
			endpoint: 'antennas/create',
			parameters: { ...baseParam, name: 'export-import-roundtrip', keywords, excludeKeywords, mustExcludeKeywords },
			user: alice,
		});

		// exportジョブを実行し、完了通知からdrive fileを特定する
		await api('i/export-antennas', {}, alice);
		let fileId: string | undefined;
		await vi.waitFor(async () => {
			const notif = await api('i/notifications', {}, alice);
			const found = (notif.body as any[]).find(n => n.type === 'exportCompleted' && n.body?.exportedEntity === 'antenna');
			fileId = found?.body?.fileId;
			if (!fileId) {
				const files = await api('drive/files', {}, alice);
				const f = (files.body as any[]).find(x => x.name.startsWith('antennas-') && x.name.endsWith('.json'));
				fileId = f?.id;
			}
			assert.ok(fileId, 'exportのdrive fileがまだない');
		}, { timeout: 60000, interval: 500 });

		// exportされたJSONがパターンを保持していること
		const fileRes = await api('drive/files/show', { fileId: fileId! }, alice);
		assert.strictEqual(fileRes.status, 200);
		const fileText = await fetch(new URL(new URL((fileRes.body as any).url).pathname, `http://127.0.0.1:${port}`)).then(r => r.text());
		const exported = JSON.parse(fileText);
		const exportedAntenna = exported.find((x: any) => x.name === 'export-import-roundtrip');
		assert.ok(exportedAntenna);
		assert.deepStrictEqual(exportedAntenna.keywords, keywords);
		assert.deepStrictEqual(exportedAntenna.excludeKeywords, excludeKeywords);
		assert.deepStrictEqual(exportedAntenna.mustExcludeKeywords, mustExcludeKeywords);
		assert.strictEqual(exportedAntenna.keywordMode, 'regex');

		// importして同じパターンで復元されること。
		// NOTE: i/import-antennas endpointはdrive fileをconfig.url経由で再取得するため
		// テスト環境(hostnameが解決できない)では直接呼べない。ここではendpointが
		// ジョブに渡すのと同じexport済みJSONを実ImportAntennasProcessorService.processに渡し、
		// DBへの復元を検証する(ジョブペイロードの経路は同一)。
		const processor = jq.get(ImportAntennasProcessorService);
		await processor.process({ data: { user: { id: alice.id }, antenna: exported } } as any);
		let imported: any;
		await vi.waitFor(async () => {
			const res = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
			const sameName = res.filter((x: any) => x.name === 'export-import-roundtrip');
			assert.ok(sameName.length >= 2, 'importされたアンテナがまだない');
			imported = sameName.find((x: any) => x.id !== created.id);
			assert.ok(imported);
		}, { timeout: 60000, interval: 500 });
		assert.deepStrictEqual(imported.keywords, keywords);
		assert.deepStrictEqual(imported.excludeKeywords, excludeKeywords);
		assert.deepStrictEqual(imported.mustExcludeKeywords, mustExcludeKeywords);
		assert.strictEqual(imported.keywordMode, 'regex');
	});

	test('keywordMode未指定(旧形式)・null明示のexport JSONがimportでき、literalとして復元されること。', async () => {
		const legacyExport = [{
			name: 'legacy-no-mode-import',
			keywords: [[' レガシー 空白 ']],
			excludeKeywords: [[]],
			mustExcludeKeywords: [[]],
			caseSensitive: false,
			src: 'all',
			userListId: null,
			users: [''],
			withFile: false,
			withReplies: false,
			excludeBots: false,
			// keywordMode を含まない(= schema上 null/未指定)
		}, {
			name: 'legacy-null-mode-import',
			keywords: [[' 明示null ']],
			excludeKeywords: [[]],
			mustExcludeKeywords: [[]],
			caseSensitive: false,
			src: 'all',
			userListId: null,
			users: [''],
			withFile: false,
			withReplies: false,
			excludeBots: false,
			keywordMode: null,
		}];

		const processor = jq.get(ImportAntennasProcessorService);
		await processor.process({ data: { user: { id: alice.id }, antenna: legacyExport } } as any);
		let imported: any;
		await vi.waitFor(async () => {
			const res = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
			imported = res.find((x: any) => x.name === 'legacy-no-mode-import');
			assert.ok(imported, 'importされたアンテナがまだない');
		}, { timeout: 60000, interval: 500 });
		assert.deepStrictEqual(imported.keywords, [[' レガシー 空白 ']]);
		assert.strictEqual(imported.keywordMode, 'literal');

		let importedNull: any;
		await vi.waitFor(async () => {
			const res = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
			importedNull = res.find((x: any) => x.name === 'legacy-null-mode-import');
			assert.ok(importedNull, 'null明示でimportされたアンテナがまだない');
		}, { timeout: 60000, interval: 500 });
		assert.deepStrictEqual(importedNull.keywords, [[' 明示null ']]);
		assert.strictEqual(importedNull.keywordMode, 'literal');
	});
});
