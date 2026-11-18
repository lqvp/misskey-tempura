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

			let noteIds = await this.fanoutTimelineService.get(`antennaTimeline:${antenna.id}`, untilId, sinceId);

			// antennaTimeline は受信時の fanout なので、アンテナを作る前から存在したノートは入らない。
			// 一方で試し打ち(antennas/test)は既存ノートを走査するため、
			// 「試し打ちでは当たるのに保存しても TL に出ない」という食い違いが起きていた。
			// TL の先頭を読むときに限り、アンテナ作成時点以降のノートを現在の条件で拾って補う。
			// (作成より前のノートは対象外にして、既存のアンテナの履歴を遡って増やさない)
			if (untilId == null && sinceId == null) {
				const backfilled = await this.getBackfillNoteIds(antenna, noteIds, me);
				noteIds = [...noteIds, ...backfilled];
			}

			// 検索時は絞り込み前に切り詰めるとヒット件数が変わるため、検索時は保持分(最大200件)をすべて取得する
			if (searchQuery == null) {
				noteIds = noteIds.slice(0, ps.limit);
			}
			if (noteIds.length === 0) {
				return [];
			}

			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id IN (:...noteIds)', { noteIds: noteIds })
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser');

			// -- ミュートされたチャンネル対策
			const mutingChannelIds = await this.channelMutingService
				.list({ requestUserId: me.id }, { idOnly: true })
				.then(x => x.map(x => x.id));
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
			if (searchQuery != null) {
				notes = notes.slice(0, ps.limit);
			}

			return await this.noteEntityService.packMany(notes, me);
		});
	}

	/**
	 * アンテナ作成時点以降のノートを現在の条件で走査し、antennaTimeline に足りないものを返す。
	 *
	 * これがないと、アンテナを作った直後の TL が空になり、
	 * 直前の試し打ちが「当たる」と表示したノートと食い違う (fanout は作成後の受信分しか持たないため)。
	 * 作成より前のノートは対象外にするので、既存アンテナの履歴が遡って増えることはない。
	 */
	private async getBackfillNoteIds(antenna: MiAntenna, alreadyReceivedNoteIds: MiNote['id'][], me: MiUser): Promise<MiNote['id'][]> {
		const received = new Set(alreadyReceivedNoteIds);
		// ユーザーが明示的に外したノートは補完で戻さない
		const removed = await this.fanoutTimelineService.getRemovedIds(`antennaTimeline:${antenna.id}`);
		// アンテナの id は作成時刻から生成されるので、ここから作成時点の id を作り、それ以降のノートに絞る。
		// これにより「アンテナ作成より前のノート」を遡って拾うことはない。
		// 同一ミリ秒に採番された id は大小が前後しうるが、境界を広げると作成前のノートまで拾ってしまうため、
		// ここでは作成時刻ちょうどを境界にする (取りこぼしは作成と同時刻のわずかなノートに限られる)
		const createdId = this.idService.gen(this.idService.parse(antenna.id).date.getTime());

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
			.orderBy('note.id', 'DESC')
			.take(BACKFILL_SCAN_LIMIT);

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBaseNoteFilteringQuery(query, me);

		const candidates = await query.getMany();

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
