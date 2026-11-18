/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

export type FanoutTimelineName = (
	// home timeline
	| `homeTimeline:${string}`
	| `homeTimelineWithFiles:${string}` // only notes with files are included
	// local timeline
	| `localTimeline` // replies are not included
	| `localTimelineWithFiles` // only non-reply notes with files are included
	| `localTimelineWithReplies` // only replies are included
	| `localTimelineWithReplyTo:${string}` // Only replies to specific local user are included. Parameter is reply user id.

	// antenna
	| `antennaTimeline:${string}`

	// user timeline
	| `userTimeline:${string}` // replies are not included
	| `userTimelineWithFiles:${string}` // only non-reply notes with files are included
	| `userTimelineWithReplies:${string}` // only replies are included
	| `userTimelineWithChannel:${string}` // only channel notes are included, replies are included

	// user list timelines
	| `userListTimeline:${string}`
	| `userListTimelineWithFiles:${string}` // only notes with files are included

	// channel timelines
	| `channelTimeline:${string}` // replies are included

	// role timelines
	| `roleTimeline:${string}` // any notes are included
);

// 明示的に外したノートの記録を保持する期間。
// 補完が走るのはアンテナ作成時点以降の直近ノートだけなので、それより十分長く取れば足りる
const REMOVED_IDS_TTL_MS = 1000 * 60 * 60 * 24 * 30;
// 1 つの TL で保持する「外したノート」の記録件数の上限
const REMOVED_IDS_MAX = 1000;

// 「外した」記録を追加し、上限を超えた古い記録を落とす。追加と削除を 1 回の呼び出しで原子的に行う
// KEYS[1]=removed キー / ARGV[1]=スコア(現在時刻) / ARGV[2]=上限件数 / ARGV[3]=TTL(ms) / ARGV[4..]=id
const ADD_REMOVED_IDS_SCRIPT = `
for i = 4, #ARGV do
	redis.call('ZADD', KEYS[1], ARGV[1], ARGV[i])
end
local count = redis.call('ZCARD', KEYS[1])
local max = tonumber(ARGV[2])
if count > max then
	redis.call('ZREMRANGEBYRANK', KEYS[1], 0, count - max - 1)
end
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return count
`;

@Injectable()
export class FanoutTimelineService {
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private idService: IdService,
	) {
	}

	@bindThis
	public push(tl: FanoutTimelineName, id: string, maxlen: number, pipeline: Redis.ChainableCommander) {
		// リモートから遅れて届いた(もしくは後から追加された)投稿日時が古い投稿が追加されるとページネーション時に問題を引き起こすため、
		// 3分以内に投稿されたものでない場合、Redisにある最古のIDより新しい場合のみ追加する
		if (this.idService.parse(id).date.getTime() > Date.now() - 1000 * 60 * 3) {
			pipeline.lpush('list:' + tl, id);
			if (Math.random() < 0.1) { // 10%の確率でトリム
				pipeline.ltrim('list:' + tl, 0, maxlen - 1);
			}
		} else {
			// 末尾のIDを取得
			this.redisForTimelines.lindex('list:' + tl, -1).then(lastId => {
				if (lastId == null || (this.idService.parse(id).date.getTime() > this.idService.parse(lastId).date.getTime())) {
					this.redisForTimelines.lpush('list:' + tl, id);
				} else {
					Promise.resolve();
				}
			});
		}
	}

	@bindThis
	public get(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null) {
		if (untilId && sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1));
		} else if (untilId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1));
		} else if (sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1));
		} else {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.sort((a, b) => a > b ? -1 : 1));
		}
	}

	@bindThis
	public getMulti(name: FanoutTimelineName[], untilId?: string | null, sinceId?: string | null): Promise<string[][]> {
		const pipeline = this.redisForTimelines.pipeline();
		for (const n of name) {
			pipeline.lrange('list:' + n, 0, -1);
		}
		return pipeline.exec().then(res => {
			if (res == null) return [];
			const tls = res.map(r => r[1] as string[]);
			return tls.map(ids =>
				(untilId && sinceId)
					? ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
					: untilId
						? ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
						: sinceId
							? ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
							: ids.sort((a, b) => a > b ? -1 : 1),
			);
		});
	}

	@bindThis
	public purge(name: FanoutTimelineName) {
		return this.redisForTimelines.del('list:' + name);
	}

	@bindThis
	public remove(name: FanoutTimelineName, id: string) {
		return this.redisForTimelines.lrem('list:' + name, 1, id);
	}

	/**
	 * ユーザーが明示的に外したノートを記録する。
	 * リストから消すだけでは「もともと受信していない」のか「外した」のか区別できないため、
	 * 後から補完(バックフィル)で拾い直さないように印を残す。
	 */
	@bindThis
	public async markRemoved(name: FanoutTimelineName, id: string) {
		await this.addRemovedIds(name, [id]);
	}

	/**
	 * 「外した」記録を追加し、上限を超えた分を古い順に落とす。
	 * SCARD を先に読んで不足分を消すと、並行追加で上限を超えるため、
	 * 追加後の件数で削除範囲を決める処理を Lua でまとめて原子的に実行する。
	 */
	@bindThis
	private async addRemovedIds(name: FanoutTimelineName, ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		const key = 'removed:' + name;
		const now = Date.now();
		const result = await this.redisForTimelines.eval(
			ADD_REMOVED_IDS_SCRIPT,
			1,
			key,
			String(now),
			String(REMOVED_IDS_MAX),
			String(REMOVED_IDS_TTL_MS),
			...ids,
		);
		if (result == null) throw new Error('Failed to mark notes as removed');
	}

	/**
	 * アンテナの TL からノートを外し、同じトランザクションで「外した」記録を残す。
	 * LREM と SADD を分けて実行すると、その間の読み取りが
	 * 「リストにも記録にも無い」状態を見てしまい、補完でノートが復活する。
	 */
	@bindThis
	public async removeNoteFromAntenna(name: FanoutTimelineName, id: string) {
		// リストから消した直後に落ちても記録が残るよう、記録の書き込み失敗は呼び出し元に伝える
		await this.redisForTimelines.lrem('list:' + name, 1, id);
		await this.addRemovedIds(name, [id]);
	}

	/**
	 * 明示的に外されたノートの一覧を返す。
	 */
	@bindThis
	public async getRemovedIds(name: FanoutTimelineName): Promise<Set<string>> {
		const key = 'removed:' + name;
		// 多くのアンテナでは記録が無いので、空のときは一覧を取らない
		if (await this.redisForTimelines.exists(key) === 0) return new Set();
		const ids = await this.redisForTimelines.zrange(key, 0, -1);
		return new Set(ids);
	}

	/**
	 * 明示的に外したノートの記録を破棄する (アンテナ削除時など)。
	 */
	@bindThis
	public purgeRemoved(name: FanoutTimelineName) {
		return this.redisForTimelines.del('removed:' + name);
	}
}
