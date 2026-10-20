/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ContactFormsRepository, MiContactForm } from '@/models/_.js';
import type { MiMeta, ContactFormCategory } from '@/models/Meta.js';
import type { SystemWebhookService } from '@/core/SystemWebhookService.js';
import type { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { IdService } from '@/core/IdService.js';
import type { MetaService } from '@/core/MetaService.js';
import { ContactFormService } from '@/core/ContactFormService.js';

const enqueueSystemWebhookMock = vi.fn();

const CATEGORIES: ContactFormCategory[] = [
	{ key: 'other', text: 'その他', enabled: true, order: 2, isDefault: false },
	{ key: 'bug_report', text: 'バグ報告', enabled: true, order: 1, isDefault: false },
	{ key: 'disabled_one', text: '無効', enabled: false, order: 0, isDefault: true },
];

/** インメモリの問い合わせビルダ (equality 条件のみ対応) */
class FakeQueryBuilder {
	private conditions: Array<Record<string, unknown>> = [];

	constructor(private rows: MiContactForm[]) {}

	andWhere(_sql: string, params: Record<string, unknown>): this {
		this.conditions.push(params);
		return this;
	}

	leftJoinAndSelect(): this { return this; }
	orderBy(): this { return this; }
	limit(): this { return this; }
	offset(): this { return this; }

	async getMany(): Promise<MiContactForm[]> {
		return this.rows.filter(row => this.conditions.every(condition =>
			Object.entries(condition).every(([key, value]) =>
				(row as unknown as Record<string, unknown>)[key] === value
			)
		));
	}
}

class FakeContactFormRepository {
	public rows: MiContactForm[] = [];
	public nextId = 1;

	async insertOne(data: Partial<MiContactForm>): Promise<MiContactForm> {
		const row = { ...data, id: `cf${this.nextId++}` } as MiContactForm;
		this.rows.push(row);
		return row;
	}

	async findOne(options: { where: { id: string } }): Promise<MiContactForm | null> {
		return this.rows.find(r => r.id === options.where.id) ?? null;
	}

	async update(id: string, data: Partial<MiContactForm>): Promise<void> {
		const row = this.rows.find(r => r.id === id);
		if (row) Object.assign(row, data);
	}

	async delete(id: string): Promise<void> {
		this.rows = this.rows.filter(r => r.id !== id);
	}

	createQueryBuilder(): FakeQueryBuilder {
		return new FakeQueryBuilder(this.rows);
	}
}

function makeService(repo: FakeContactFormRepository, categories: ContactFormCategory[] = CATEGORIES): ContactFormService {
	const systemWebhookService = {
		enqueueSystemWebhook: enqueueSystemWebhookMock,
	} as unknown as SystemWebhookService;
	const userEntityService = {
		pack: async (user: unknown) => ({ id: 'packed' }),
	} as unknown as UserEntityService;
	const idService = { gen: () => 'gen-id' } as unknown as IdService;
	const metaService = {
		fetch: async () => ({ contactFormCategories: categories }) as MiMeta,
	} as unknown as MetaService;

	return new ContactFormService(
		repo as unknown as ContactFormsRepository,
		systemWebhookService,
		userEntityService,
		idService,
		metaService,
	);
}

describe('ContactFormService', () => {
	beforeEach(() => {
		enqueueSystemWebhookMock.mockReset();
	});

	describe('getEnabledCategories', () => {
		test('正常: 有効なカテゴリのみ順序付きで返す', async () => {
			const svc = makeService(new FakeContactFormRepository());
			const categories = await svc.getEnabledCategories();
			expect(categories.map(c => c.key)).toEqual(['bug_report', 'other']);
		});
	});

	describe('getDefaultCategory', () => {
		test('正常: デフォルトカテゴリを返す', async () => {
			const svc = makeService(new FakeContactFormRepository(), [
				{ key: 'other', text: 'その他', enabled: true, order: 1, isDefault: true },
			]);
			expect(await svc.getDefaultCategory()).toBe('other');
		});

		test('正常: デフォルトが無い場合は other を返す', async () => {
			const svc = makeService(new FakeContactFormRepository(), [
				{ key: 'bug_report', text: 'バグ報告', enabled: true, order: 1, isDefault: false },
			]);
			expect(await svc.getDefaultCategory()).toBe('other');
		});

		test('正常: 無効なカテゴリがデフォルトなら無視される', async () => {
			const svc = makeService(new FakeContactFormRepository(), CATEGORIES);
			expect(await svc.getDefaultCategory()).toBe('other');
		});
	});

	describe('validateCategory', () => {
		test('正常: 有効なカテゴリは true', async () => {
			const svc = makeService(new FakeContactFormRepository());
			expect(await svc.validateCategory('bug_report')).toBe(true);
		});

		test('異常: 無効・存在しないカテゴリは false', async () => {
			const svc = makeService(new FakeContactFormRepository());
			expect(await svc.validateCategory('disabled_one')).toBe(false);
			expect(await svc.validateCategory('unknown')).toBe(false);
		});
	});

	describe('submit', () => {
		test('正常: 問い合わせを登録し Webhook を通知する', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			const result = await svc.submit({
				subject: '  お問い合わせ  ',
				content: '  本文  ',
				replyMethod: 'email',
				email: '  a@example.com  ',
				category: 'bug_report',
			});

			expect(result.subject).toBe('お問い合わせ');
			expect(result.content).toBe('本文');
			expect(result.email).toBe('a@example.com');
			expect(result.status).toBe('pending');
			expect(result.category).toBe('bug_report');
			expect(enqueueSystemWebhookMock).toHaveBeenCalledTimes(1);
			expect(enqueueSystemWebhookMock.mock.calls[0][0]).toBe('receivedContactForm');
		});

		test('正常: カテゴリ未指定時はデフォルトカテゴリを使う', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo, [
				{ key: 'other', text: 'その他', enabled: true, order: 1, isDefault: true },
			]);

			const result = await svc.submit({
				subject: '件名',
				content: '本文',
				replyMethod: 'misskey',
			});
			expect(result.category).toBe('other');
		});

		test('異常: 存在しないカテゴリは例外になる', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await expect(svc.submit({
				subject: '件名',
				content: '本文',
				replyMethod: 'email',
				category: 'unknown',
			})).rejects.toThrow('Invalid category');
			expect(repo.rows).toHaveLength(0);
		});
	});

	describe('list', () => {
		test('正常: ステータスで絞り込む', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await svc.submit({ subject: 'a', content: 'a', replyMethod: 'email', category: 'other' });
			await svc.submit({ subject: 'b', content: 'b', replyMethod: 'email', category: 'other' });
			await svc.update('cf1', { status: 'resolved' });

			const resolved = await svc.list({ limit: 10, offset: 0, status: 'resolved' });
			expect(resolved).toHaveLength(1);
			expect(resolved[0].id).toBe('cf1');
		});

		test('正常: カテゴリで絞り込む', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await svc.submit({ subject: 'a', content: 'a', replyMethod: 'email', category: 'bug_report' });
			await svc.submit({ subject: 'b', content: 'b', replyMethod: 'email', category: 'other' });

			const filtered = await svc.list({ limit: 10, offset: 0, category: 'bug_report' });
			expect(filtered).toHaveLength(1);
			expect(filtered[0].category).toBe('bug_report');
		});
	});

	describe('show / update / delete', () => {
		test('正常: 登録内容を取得できる', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await svc.submit({ subject: 'a', content: 'a', replyMethod: 'email', category: 'other' });
			const found = await svc.show('cf1');
			expect(found!.subject).toBe('a');
		});

		test('正常: ステータスとメモを更新できる', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await svc.submit({ subject: 'a', content: 'a', replyMethod: 'email', category: 'other' });
			await svc.update('cf1', { status: 'in_progress', adminNote: '担当中' });

			const found = await svc.show('cf1');
			expect(found!.status).toBe('in_progress');
			expect(found!.adminNote).toBe('担当中');
		});

		test('正常: 削除できる', async () => {
			const repo = new FakeContactFormRepository();
			const svc = makeService(repo);

			await svc.submit({ subject: 'a', content: 'a', replyMethod: 'email', category: 'other' });
			await svc.delete('cf1');

			expect(await svc.show('cf1')).toBeNull();
		});
	});
});
