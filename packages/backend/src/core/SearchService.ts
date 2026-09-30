/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { type Config, FulltextSearchProvider } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiNote } from '@/models/Note.js';
import type { NotesRepository } from '@/models/_.js';
import { MiUser, type MiMeta } from '@/models/_.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Index, Meilisearch } from 'meilisearch';

type K = string;
type V = string | number | boolean;
type Q =
	{ op: '=', k: K, v: V } |
	{ op: '!=', k: K, v: V } |
	{ op: '>', k: K, v: number } |
	{ op: '<', k: K, v: number } |
	{ op: '>=', k: K, v: number } |
	{ op: '<=', k: K, v: number } |
	{ op: 'is null', k: K } |
	{ op: 'is not null', k: K } |
	{ op: 'and', qs: Q[] } |
	{ op: 'or', qs: Q[] } |
	{ op: 'not', q: Q };

export type SearchOpts = {
	userId?: MiNote['userId'] | null;
	channelId?: MiNote['channelId'] | null;
	host?: string | null;
	visibility?: MiNote['visibility'] | 'all';
	hasFiles?: 'all' | 'with' | 'without';
	hasCw?: 'all' | 'with' | 'without';
	hasReply?: 'all' | 'with' | 'without';
	hasPoll?: 'all' | 'with' | 'without';
	searchOperator?: 'and' | 'or';
	excludeWords?: string[];
	advancedSyntax?: boolean;
	sinceDate?: number;
	untilDate?: number;
	rangeStartAt?: number | null;
	rangeEndAt?: number | null;
};

export type SearchPagination = {
	untilId?: MiNote['id'];
	sinceId?: MiNote['id'];
	limit: number;
};

function compileValue(value: V): string {
	if (typeof value === 'string') {
		return `'${value}'`; // TODO: escape
	} else if (typeof value === 'number') {
		return value.toString();
	} else if (typeof value === 'boolean') {
		return value.toString();
	}
	throw new Error('unrecognized value');
}

function compileQuery(q: Q): string {
	switch (q.op) {
		case '=': return `(${q.k} = ${compileValue(q.v)})`;
		case '!=': return `(${q.k} != ${compileValue(q.v)})`;
		case '>': return `(${q.k} > ${compileValue(q.v)})`;
		case '<': return `(${q.k} < ${compileValue(q.v)})`;
		case '>=': return `(${q.k} >= ${compileValue(q.v)})`;
		case '<=': return `(${q.k} <= ${compileValue(q.v)})`;
		case 'and': return q.qs.length === 0 ? '' : `(${ q.qs.map(_q => compileQuery(_q)).join(' AND ') })`;
		case 'or': return q.qs.length === 0 ? '' : `(${ q.qs.map(_q => compileQuery(_q)).join(' OR ') })`;
		case 'is null': return `(${q.k} IS NULL)`;
		case 'is not null': return `(${q.k} IS NOT NULL)`;
		case 'not': return `(NOT ${compileQuery(q.q)})`;
		default: throw new Error('unrecognized query operator');
	}
}

@Injectable()
export class SearchService {
	private readonly meilisearchIndexScope: 'local' | 'global' | string[] = 'local';
	private readonly meilisearchNoteIndex: Index | null = null;
	private readonly provider: FulltextSearchProvider;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meilisearch)
		private meilisearch: Meilisearch | null,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private cacheService: CacheService,
		private queryService: QueryService,
		private idService: IdService,
		private loggerService: LoggerService,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {
		if (meilisearch) {
			this.meilisearchNoteIndex = meilisearch.index(`${config.meilisearch!.index}---notes`);
			this.meilisearchNoteIndex.updateSettings({
				searchableAttributes: [
					'text',
					'cw',
				],
				sortableAttributes: [
					'createdAt',
				],
				filterableAttributes: [
					'createdAt',
					'userId',
					'userHost',
					'channelId',
					'tags',
				],
				typoTolerance: {
					enabled: false,
				},
				pagination: {
					maxTotalHits: 10000,
				},
			});
		}

		if (config.meilisearch?.scope) {
			this.meilisearchIndexScope = config.meilisearch.scope;
		}

		this.provider = config.fulltextSearch?.provider ?? 'sqlLike';
		this.loggerService.getLogger('SearchService').info(`-- Provider: ${this.provider}`);
	}

	@bindThis
	public async indexNote(note: MiNote): Promise<void> {
		if (!this.meilisearch) return;
		if (note.text == null && note.cw == null) return;
		if (!['home', 'public'].includes(note.visibility)) return;

		switch (this.meilisearchIndexScope) {
			case 'global':
				break;

			case 'local':
				if (note.userHost == null) break;
				return;

			default: {
				if (note.userHost == null) break;
				if (this.meilisearchIndexScope.includes(note.userHost)) break;
				return;
			}
		}

		await this.meilisearchNoteIndex?.addDocuments([{
			id: note.id,
			createdAt: this.idService.parse(note.id).date.getTime(),
			userId: note.userId,
			userHost: note.userHost,
			channelId: note.channelId,
			cw: note.cw,
			text: note.text,
			tags: note.tags,
		}], {
			primaryKey: 'id',
		});
	}

	@bindThis
	public async unindexNote(note: MiNote): Promise<void> {
		if (!this.meilisearch) return;
		if (!['home', 'public'].includes(note.visibility)) return;

		await this.meilisearchNoteIndex?.deleteDocument(note.id);
	}

	@bindThis
	public async searchNote(
		q: string,
		me: MiUser | null,
		opts: SearchOpts,
		pagination: SearchPagination,
	): Promise<MiNote[]> {
		switch (this.provider) {
			case 'sqlLike':
			case 'sqlPgroonga': {
				// ほとんど内容に差がないのでsqlLikeとsqlPgroongaを同じ処理にしている.
				// 今後の拡張で差が出る用であれば関数を分ける.
				return this.searchNoteByLike(q, me, opts, pagination);
			}
			case 'meilisearch': {
				return this.searchNoteByMeilisearch(q, me, opts, pagination);
			}
			default: {
				const _: never = this.provider;
				return [];
			}
		}
	}

	@bindThis
	private async searchNoteByLike(
		q: string,
		me: MiUser | null,
		opts: SearchOpts,
		pagination: SearchPagination,
	): Promise<MiNote[]> {
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), pagination.sinceId, pagination.untilId, opts.sinceDate, opts.untilDate);

		if (opts.userId) {
			query.andWhere('note.userId = :userId', { userId: opts.userId });
		} else if (opts.channelId) {
			query.andWhere('note.channelId = :channelId', { channelId: opts.channelId });
		}

		// Filter by visibility
		if (opts.visibility && opts.visibility !== 'all') {
			query.andWhere('note.visibility = :visibility', { visibility: opts.visibility });
		}

		// Filter notes with files
		if (opts.hasFiles === 'with') {
			query.andWhere('array_length(note."fileIds", 1) > 0');
		} else if (opts.hasFiles === 'without') {
			query.andWhere('note."fileIds" = :fileIds', { fileIds: [] });
		}

		// Filter notes with CW
		if (opts.hasCw === 'with') {
			query.andWhere('note.cw IS NOT NULL AND note.cw != :emptyString', { emptyString: '' });
		} else if (opts.hasCw === 'without') {
			query.andWhere('(note.cw IS NULL OR note.cw = :emptyString)', { emptyString: '' });
		}

		// Filter notes with replies
		if (opts.hasReply === 'with') {
			query.andWhere('note."replyId" IS NOT NULL');
		} else if (opts.hasReply === 'without') {
			query.andWhere('note."replyId" IS NULL');
		}

		// Filter notes with polls
		if (opts.hasPoll === 'with') {
			query.andWhere('note."hasPoll" = TRUE');
		} else if (opts.hasPoll === 'without') {
			query.andWhere('note."hasPoll" = FALSE');
		}

		query
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser');

		// テキスト検索条件の追加
		if (this.config.fulltextSearch?.provider === 'sqlPgroonga') {
			// &@~ は検索文字列を Groonga のクエリ構文として解釈するため、
			// ユーザー入力を素のまま渡すと ( ) " \ などの特殊文字や - による否定が
			// 演算子として解釈され、意図しない除外や構文崩れでノートがこぼれ落ちる。
			// また OR キーワードは PGroonga のバージョンに依存する (v2 では ||)。
			// そこで各検索語をダブルクォートで囲んで字面語として扱い、
			// AND は Groonga 側 (空白区切り)、OR と否定は SQL 側で結合する。
			const quoteTerm = (term: string): string => `"${term.replace(/[\\"]/g, '\\$1')}"`;

			// advancedSyntax=true のときだけ、語の先頭の + - ~ (必須/除外/部分一致) と
			// 末尾の * (前方一致) を Groonga クエリ構文として透過する。
			// 素の語は従来どおり引用し、括弧はバランスが取れている場合のみ透過する。
			const compileTerm = (term: string): string => {
				if (!opts.advancedSyntax) return quoteTerm(term);
				const match = term.match(/^([+~-]?)(.+?)(\*?)$/);
				if (match == null) return quoteTerm(term);
				const [, prefix, core, wildcard] = match;
				if (core.includes('(') || core.includes(')')) {
					const open = (core.match(/\(/g) ?? []).length;
					const close = (core.match(/\)/g) ?? []).length;
					if (open !== close) return quoteTerm(term);
				}
				return `${prefix}${quoteTerm(core)}${wildcard}`;
			};

			const terms = (opts.searchOperator === 'or'
				? q.split(' OR ') // notes/search.ts が or 検索時に ' OR ' で連結した区切り
				: q.split(/\s+/)
			).map(term => term.trim()).filter(term => term !== '');

			if (terms.length > 0) {
				if (opts.searchOperator === 'or' && terms.length > 1) {
					// OR検索はSQL側で条件結合し、クエリ構文のORキーワードに依存しない
					const params: Record<string, string> = {};
					const conditions = terms.map((term, index) => {
						params[`pgQuery${index}`] = compileTerm(term);
						return `note.text &@~ :pgQuery${index}`;
					});
					query.andWhere(new Brackets(qb => {
						qb.where(conditions.join(' OR '));
					}), params);
				} else {
					// AND検索は各語を空白区切りで渡す (Groongaクエリ構文のAND)
					query.andWhere('note.text &@~ :pgQuery', { pgQuery: terms.map(compileTerm).join(' ') });
				}
			}

			// 除外語はSQL側でNOTとして適用する。
			// クエリ構文では否定のみの検索 (-a -b) が成立しないため、
			// 肯定クエリが空でも除外語だけで検索できるようにする。
			if (opts.excludeWords) {
				opts.excludeWords.forEach((word, index) => {
					const trimmed = word.trim();
					if (trimmed === '') return;
					query.andWhere(new Brackets(qb => {
						qb
							.where('note.text IS NULL')
							.orWhere(`NOT (note.text &@~ :pgExclude${index})`);
					}), { [`pgExclude${index}`]: compileTerm(trimmed) });
				});
			}
		} else if (q !== '') {
			// sqlLikeプロバイダーでの検索処理
			if (q.includes(' OR ')) {
				// OR検索の場合、各語句をOR条件で結合
				const terms = q.split(' OR ').map(term => term.trim()).filter(term => term !== '');
				if (terms.length > 0) {
					const orConditions = terms.map((term, index) =>
						`LOWER(note.text) LIKE :term${index}`,
					).join(' OR ');
					const params: Record<string, string> = {};
					terms.forEach((term, index) => {
						params[`term${index}`] = `%${sqlLikeEscape(term.toLowerCase())}%`;
					});
					query.andWhere(`(${orConditions})`, params);
				}
			} else {
				// AND検索の場合、従来通りの処理
				query.andWhere('LOWER(note.text) LIKE :q', { q: `%${ sqlLikeEscape(q.toLowerCase()) }%` });
			}
		}

		if (opts.host) {
			if (opts.host === '.') {
				query.andWhere('note.userHost IS NULL');
			} else {
				query.andWhere('note.userHost = :host', { host: opts.host });
			}
		}

		if (opts.rangeStartAt != null) {
			const date = this.idService.gen(opts.rangeStartAt - 1);
			query.andWhere('note.id > :rangeStartAt', { rangeStartAt: date });
		}

		if (opts.rangeEndAt != null) {
			const date = this.idService.gen(opts.rangeEndAt + 1);
			query.andWhere('note.id < :rangeEndAt', { rangeEndAt: date });
		}

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBaseNoteFilteringQuery(query, me);

		return query.limit(pagination.limit).getMany();
	}

	@bindThis
	private async searchNoteByMeilisearch(
		q: string,
		me: MiUser | null,
		opts: SearchOpts,
		pagination: SearchPagination,
	): Promise<MiNote[]> {
		if (!this.meilisearch || !this.meilisearchNoteIndex) {
			throw new Error('Meilisearch is not available');
		}

		const filter: Q = {
			op: 'and',
			qs: [],
		};
		if (pagination.untilId) filter.qs.push({
			op: '<',
			k: 'createdAt',
			v: this.idService.parse(pagination.untilId).date.getTime(),
		});
		if (opts.rangeEndAt) filter.qs.push({
			op: '<=',
			k: 'createdAt',
			v: opts.rangeEndAt,
		});
		if (pagination.sinceId) filter.qs.push({
			op: '>',
			k: 'createdAt',
			v: this.idService.parse(pagination.sinceId).date.getTime(),
		});
		if (opts.rangeStartAt) filter.qs.push({
			op: '>=',
			k: 'createdAt',
			v: opts.rangeStartAt,
		});
		if (opts.userId) filter.qs.push({ op: '=', k: 'userId', v: opts.userId });
		if (opts.channelId) filter.qs.push({ op: '=', k: 'channelId', v: opts.channelId });
		if (opts.host) {
			if (opts.host === '.') {
				filter.qs.push({ op: 'is null', k: 'userHost' });
			} else {
				filter.qs.push({ op: '=', k: 'userHost', v: opts.host });
			}
		}
		if (me == null) {
			if (this.meta.ugcVisibilityForVisitor === 'none') return [];
			if (this.meta.ugcVisibilityForVisitor === 'local') filter.qs.push({ op: 'is null', k: 'userHost' });
		}
		const res = await this.meilisearchNoteIndex.search(q, {
			sort: ['createdAt:desc'],
			matchingStrategy: 'all',
			attributesToRetrieve: ['id', 'createdAt'],
			filter: compileQuery(filter),
			limit: pagination.limit,
		});
		if (res.hits.length === 0) {
			return [];
		}

		const [
			userIdsWhoMeMuting,
			userIdsWhoBlockingMe,
		] = me
			? await Promise.all([
				this.cacheService.userMutingsCache.fetch(me.id),
				this.cacheService.userBlockedCache.fetch(me.id),
			])
			: [new Set<string>(), new Set<string>()];

		const query = this.notesRepository.createQueryBuilder('note')
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser');

		query.where('note.id IN (:...noteIds)', { noteIds: res.hits.map(x => x.id) });

		this.queryService.generateBlockedHostQueryForNote(query);
		this.queryService.generateSuspendedUserQueryForNote(query);
		if (me == null) {
			this.queryService.generateUgcVisibilityQueryForVisitor(query);
		}

		const notes = (await query.getMany()).filter(note => {
			if (me && isUserRelated(note, userIdsWhoBlockingMe)) return false;
			if (me && isUserRelated(note, userIdsWhoMeMuting)) return false;
			return true;
		});

		return notes.sort((a, b) => a.id > b.id ? -1 : 1);
	}
}
