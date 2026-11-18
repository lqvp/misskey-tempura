/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { NotesRepository, AntennasRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { ApiLoggerService } from '../../ApiLoggerService.js';
import { ApiError } from '../../error.js';

// 補完で走査するノートの上限。受信経路が fanout で保持する件数(200)に揃える
const BACKFILL_SCAN_LIMIT = 200;

export const meta = {
	tags: ['antennas', 'account', 'notes'],

	requireCredential: true,

	kind: 'read:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		// アンテナのTL内検索(直近最大200件が対象)
		query: { type: 'string', nullable: true, maxLength: 100 },
	},
	required: ['antennaId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private fanoutTimelineService: FanoutTimelineService,
		private globalEventService: GlobalEventService,
		private channelMutingService: ChannelMutingService,
		private antennaService: AntennaService,
		private apiLoggerService: ApiLoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const antenna = await this.antennasRepository.findOneBy({
				id: ps.antennaId,
				userId: me.id,
			});

			if (antenna == null) {
				throw new ApiError(meta.errors.noSuchAntenna);
			}

			// falseだった場合はアンテナの配信先が増えたことを通知したい
			const needPublishEvent = !antenna.isActive;

			antenna.isActive = true;
			antenna.lastUsedAt = new Date();
			trackPromise(this.antennasRepository.update(antenna.id, antenna));

			if (needPublishEvent) {
				this.globalEventService.publishInternalEvent('antennaUpdated', antenna);
			}

			const searchQuery = ps.query != null && ps.query.trim() !== '' ? ps.query.trim().toLowerCase() : null;

			// -- ミュートされたチャンネル対策。補完の走査でも同じ条件を使うので先に求める
			const mutingChannelIds = await this.channelMutingService
				.list({ requestUserId: me.id }, { idOnly: true })
				.then(x => x.map(x => x.id));

			const noteIds = await this.fanoutTimelineService.get(`antennaTimeline:${antenna.id}`, untilId, sinceId);

			// antennaTimeline は受信時の fanout なので、アンテナを作る前から存在したノートは入らない。
			// 一方で試し打ち(antennas/test)は既存ノートを走査するため、
			// 「試し打ちでは当たるのに保存しても TL に出ない」という食い違いが起きていた。
			// TL の先頭を読むときに限り、アンテナ作成時点以降のノートを現在の条件で拾って補う。
			// (作成より前のノートは対象外にして、既存のアンテナの履歴が遡って増えないようにする)
			const backfilledNoteIds = (untilId == null && sinceId == null)
				? await this.getBackfillNoteIds(antenna, noteIds, me, mutingChannelIds)
				: [];

			if (noteIds.length === 0 && backfilledNoteIds.length === 0) {
				return [];
			}

			// 受信済みも補完分も「新しい順」に並べてから使う。
			// fanout の履歴を先に連結して件数制限すると、補完で拾ったより新しいノートが捨てられてしまう
			const candidateNoteIds = this.mergeNoteIds(noteIds, backfilledNoteIds);

			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id IN (:...candidateNoteIds)', { candidateNoteIds })
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				// checkHitAntenna は note.channel?.isSensitive を見るので、条件の再判定に備えて読み込む。
				// 読み込まないと「センシティブチャンネルのノートを除外」が効かない
				.leftJoinAndSelect('note.channel', 'channel')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser');

			if (mutingChannelIds.length > 0) {
				query.andWhere(new Brackets(qb => {
					qb.orWhere('note.channelId IS NULL');
					qb.orWhere('note.channelId NOT IN (:...mutingChannelIds)', { mutingChannelIds });
				}));
				query.andWhere(new Brackets(qb => {
					qb.orWhere('note.renoteChannelId IS NULL');
					qb.orWhere('note.renoteChannelId NOT IN (:...mutingChannelIds)', { mutingChannelIds });
				}));
			}

			// NOTE: センシティブ除外の設定はこのエンドポイントでは無視する。
			// https://github.com/misskey-dev/misskey/pull/15346#discussion_r1929950255

			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBaseNoteFilteringQuery(query, me);

			let notes = await query.getMany();

			// 受信済みのノートでも「いまの条件」を満たさないものは TL から外す。
			// 条件を変更しても fanout 済みのノートは残り続けるため、そのまま返すと
			// 「キーワードを変えたのに古いノートが出続け、マッチ理由も付かない」状態になる。
			// 試し打ち・受信経路と同じ判定を使い、TL に並ぶ条件をアンテナの現在の条件に揃える。
			notes = await this.filterByCurrentConditions(antenna, notes);

			if (searchQuery != null) {
				notes = notes.filter(note => {
					const text = [note.text, note.cw].filter((t): t is string => t != null && t !== '').join('\n').toLowerCase();
					return text.includes(searchQuery);
				});
			}

			if (sinceId != null && untilId == null) {
				notes.sort((a, b) => a.id < b.id ? -1 : 1);
			} else {
				notes.sort((a, b) => a.id > b.id ? -1 : 1);
			}

			// 件数制限は「条件で絞ったあと」に行う。
			// 先に limit すると、古い条件でだけ一致するノートが枠を食い、条件的には一致するノートが
			// 次のページに押し出される (最悪、一致ノートがあるのに空のページが返る)
			notes = notes.slice(0, ps.limit);

			return await this.noteEntityService.packMany(notes, me);
		});
	}

	/**
	 * 受信済みの id と補完した id を 1 つにまとめ、重複を除いて新しい順に並べる。
	 * fanout の履歴を先に連結して件数制限すると、補完で拾ったより新しいノートが捨てられてしまうため、
	 * 制限をかける前にここで順序を揃える。
	 */
	private mergeNoteIds(receivedNoteIds: MiNote['id'][], backfilledNoteIds: MiNote['id'][]): MiNote['id'][] {
		const unique = [...new Set([...receivedNoteIds, ...backfilledNoteIds])];
		// note id はソート可能な形式なので、降順に並べれば新しい順になる
		return unique.sort((a, b) => a > b ? -1 : 1);
	}

	/**
	 * アンテナ作成時点以降のノートを現在の条件で走査し、antennaTimeline に足りないものを返す。
	 *
	 * これがないと、アンテナを作った直後の TL が空になり、
	 * 直前の試し打ちが「当たる」と表示したノートと食い違う (fanout は作成後の受信分しか持たないため)。
	 * 作成より前のノートは対象外にするので、既存アンテナの履歴が遡って増えることはない。
	 */
	private async getBackfillNoteIds(antenna: MiAntenna, alreadyReceivedNoteIds: MiNote['id'][], me: MiUser, mutingChannelIds: MiChannel['id'][]): Promise<MiNote['id'][]> {
		const received = new Set(alreadyReceivedNoteIds);
		// ユーザーが明示的に外したノートは補完で戻さない
		const removed = await this.fanoutTimelineService.getRemovedIds(`antennaTimeline:${antenna.id}`);
		// アンテナの id は作成時刻から生成されるので、その時刻を境界にして「作成以降」に絞る。
		// これにより「アンテナ作成より前のノート」を遡って拾うことはない。
		// 境界には gen() ではなく genMinimum() を使う。gen() は同一ミリ秒でもカウンタ/乱数で
		// 値が前後するため、それを下限にすると同じミリ秒に採番されたノートを取りこぼす
		const createdId = this.idService.genMinimum(this.idService.parse(antenna.id).date.getTime());

		// 取得側のクエリと同じ join を揃える。
		// generateBaseNoteFilteringQuery は replyUser / renoteUser の別名を参照するため、join し忘れるとエラーになる
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id >= :createdId', { createdId })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('note.channel', 'channel')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.orderBy('note.id', 'DESC');

		// ミュートしたチャンネルのノートは応答側で落とすので、補完の走査枠も消費させない。
		// 走査枠を先に埋められると、表示できる一致ノートがあっても判定されず TL が空になる
		if (mutingChannelIds.length > 0) {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.channelId IS NULL');
				qb.orWhere('note.channelId NOT IN (:...mutingChannelIds)', { mutingChannelIds });
			}));
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.renoteChannelId IS NULL');
				qb.orWhere('note.renoteChannelId NOT IN (:...mutingChannelIds)', { mutingChannelIds });
			}));
		}

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBaseNoteFilteringQuery(query, me);

		// フィルタを適用したうえで走査件数を制限する
		const candidates = await query.take(BACKFILL_SCAN_LIMIT).getMany();

		// 判定はノートごとに独立なので並列に回す (直列だと最大 BACKFILL_SCAN_LIMIT 回の待ち合わせになる)
		const evaluated = await Promise.all(candidates.map(async note => {
			if (note.user == null) return null;
			if (received.has(note.id)) return null;
			if (removed.has(note.id)) return null;
			// 判定に失敗したノートは補完対象から外し、TL 全体を止めない(受信経路と同じ扱い)
			const hit = await this.antennaService.checkHitAntenna(antenna, note, note.user).catch(err => {
				this.apiLoggerService.logger.warn(`Failed to evaluate antenna hit for backfill (antenna: ${antenna.id}, note: ${note.id})`, { err });
				return false;
			});
			return hit ? note.id : null;
		}));
		return evaluated.filter((id): id is MiNote['id'] => id != null);
	}

	/**
	 * TL に並べる前に、いまの条件を満たすノートだけに絞る。
	 * antennaTimeline は受信時の条件で積まれた履歴なので、条件変更後には合わないノートが残る。
	 */
	private async filterByCurrentConditions(antenna: MiAntenna, notes: MiNote[]): Promise<MiNote[]> {
		if (notes.length === 0) return notes;
		const hits = await Promise.all(notes.map(note => {
			if (note.user == null) return Promise.resolve(false);
			// 判定に失敗したノートは非表示側に倒す(条件に合うと言えないものを出さない)。
			// 黙って消すと「ノートが減った」ことに気づけないため、ログは残す
			return this.antennaService.checkHitAntenna(antenna, note, note.user).catch(err => {
				this.apiLoggerService.logger.warn(`Failed to evaluate antenna condition (antenna: ${antenna.id}, note: ${note.id})`, { err });
				return false;
			});
		}));
		return notes.filter((_, i) => hits[i]);
	}
}
