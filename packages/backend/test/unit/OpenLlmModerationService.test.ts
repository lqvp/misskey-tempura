/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { MiMeta, MiNote } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { LlmModerationQueueService } from '@/core/LlmModerationQueueService.js';
import { OpenLlmModerationService } from '@/core/OpenLlmModerationService.js';

const sendMock = vi.fn();
const enqueueMock = vi.fn();

const DEFAULT_META: {
	openLlmModerationEnabled: boolean;
	openLlmModerationApiKey: string | null;
	openLlmModerationApiUrl: string | null;
	openLlmModerationModel: string | null;
	openLlmModerationIncludeRemote: boolean;
	openLlmModerationVisibilities: string[];
} = {
	openLlmModerationEnabled: true,
	openLlmModerationApiKey: 'test-key',
	openLlmModerationApiUrl: null,
	openLlmModerationModel: null,
	openLlmModerationIncludeRemote: false,
	openLlmModerationVisibilities: ['public'],
};

function makeService(metaOverrides: Partial<typeof DEFAULT_META> = {}): OpenLlmModerationService {
	const meta = { ...DEFAULT_META, ...metaOverrides } as unknown as MiMeta;
	const httpRequestService = { send: sendMock } as unknown as HttpRequestService;
	const llmModerationQueueService = { enqueue: enqueueMock } as unknown as LlmModerationQueueService;
	const loggerService = {
		getLogger: () => ({ warn: () => {}, error: () => {}, info: () => {} }),
	} as unknown as LoggerService;
	return new OpenLlmModerationService(meta, httpRequestService, llmModerationQueueService, loggerService);
}

function makeNote(overrides: Partial<MiNote> = {}): MiNote {
	return {
		id: 'note1',
		userId: 'user1',
		userHost: null,
		visibility: 'public',
		text: 'hello',
		...overrides,
	} as MiNote;
}

function okResponse(data: unknown) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => data,
	};
}

describe('OpenLlmModerationService', () => {
	beforeEach(() => {
		sendMock.mockReset();
		enqueueMock.mockReset();
	});

	describe('moderateNote', () => {
		test('正常: フラグされた場合はキューへ登録する', async () => {
			sendMock.mockResolvedValue(okResponse({
				id: 'mod-1',
				model: 'omni-moderation-latest',
				results: [{
					flagged: true,
					categories: { harassment: true, violence: false },
					category_scores: { harassment: 0.9 },
				}],
			}));

			const svc = makeService();
			await svc.moderateNote(makeNote(), { text: 'hello' });

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(enqueueMock).toHaveBeenCalledTimes(1);
			const payload = enqueueMock.mock.calls[0][0];
			expect(payload.provider).toBe('openai');
			expect(payload.model).toBe('omni-moderation-latest');
			expect(payload.flaggedCategories).toEqual(['harassment']);
			expect(payload.categoryScores).toEqual({ harassment: 0.9 });
		});

		test('正常: フラグされていない場合はキューへ登録しない', async () => {
			sendMock.mockResolvedValue(okResponse({
				model: 'omni-moderation-latest',
				results: [{ flagged: false, categories: {}, category_scores: {} }],
			}));

			const svc = makeService();
			await svc.moderateNote(makeNote(), { text: 'hello' });

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(enqueueMock).not.toHaveBeenCalled();
		});

		test('正常: CW と文本と投票をまとめて送信する', async () => {
			sendMock.mockResolvedValue(okResponse({ results: [{ flagged: false }] }));

			const svc = makeService();
			await svc.moderateNote(makeNote(), { text: '本文', cw: '警告', pollChoices: ['A', 'B'] });

			const body = JSON.parse(sendMock.mock.calls[0][1].body);
			expect(body.input).toContain('[CW] 警告');
			expect(body.input).toContain('本文');
			expect(body.input).toContain('Poll: A / B');
		});

		test('正常: 入力が空の場合は送信しない', async () => {
			const svc = makeService();
			await svc.moderateNote(makeNote(), { text: '   ' });
			expect(sendMock).not.toHaveBeenCalled();
		});

		test('正常: 機能が無効なら送信しない', async () => {
			const svc = makeService({ openLlmModerationEnabled: false });
			await svc.moderateNote(makeNote(), { text: 'hello' });
			expect(sendMock).not.toHaveBeenCalled();
		});

		test('正常: API キー未設定なら送信しない', async () => {
			const svc = makeService({ openLlmModerationApiKey: null });
			await svc.moderateNote(makeNote(), { text: 'hello' });
			expect(sendMock).not.toHaveBeenCalled();
		});

		test('正常: リモートノートは既定で対象外', async () => {
			const svc = makeService();
			await svc.moderateNote(makeNote({ userHost: 'remote.example.com' }), { text: 'hello' });
			expect(sendMock).not.toHaveBeenCalled();
		});

		test('正常: リモートノートも包含指定なら対象になる', async () => {
			sendMock.mockResolvedValue(okResponse({ results: [{ flagged: false }] }));

			const svc = makeService({ openLlmModerationIncludeRemote: true });
			await svc.moderateNote(makeNote({ userHost: 'remote.example.com' }), { text: 'hello' });
			expect(sendMock).toHaveBeenCalledTimes(1);
		});

		test('正常: 可視性が対象外のノートは送信しない', async () => {
			const svc = makeService();
			await svc.moderateNote(makeNote({ visibility: 'followers' }), { text: 'hello' });
			expect(sendMock).not.toHaveBeenCalled();
		});

		test('正常: API エラーは握りつぶして処理を継続する', async () => {
			sendMock.mockRejectedValue(new Error('network down'));

			const svc = makeService();
			await expect(svc.moderateNote(makeNote(), { text: 'hello' })).resolves.toBeUndefined();
			expect(enqueueMock).not.toHaveBeenCalled();
		});

		test('正常: カスタム API URL の場合のみローカルアドレスを許可する', async () => {
			sendMock.mockResolvedValue(okResponse({ results: [{ flagged: false }] }));

			await makeService().moderateNote(makeNote(), { text: 'hello' });
			expect(sendMock.mock.calls[0][1].isLocalAddressAllowed).toBe(false);

			await makeService({ openLlmModerationApiUrl: 'http://localhost:3009' }).moderateNote(makeNote(), { text: 'hello' });
			expect(sendMock.mock.calls[1][1].isLocalAddressAllowed).toBe(true);
		});
	});
});
