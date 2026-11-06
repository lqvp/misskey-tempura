/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import * as Acct from '@/misc/acct.js';
import type { AntennaMatchInfo } from '@/misc/antenna-match.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AntennasRepository, UserListMembershipsRepository } from '@/models/_.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { CacheService } from './CacheService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export interface Match {
	keyword: string;
	start: number;
	end: number;
	groupIndex?: number;
	type?: 'include' | 'exclude';
}

@Injectable()
export class AntennaService implements OnApplicationShutdown {
	private logger: Logger;
	private antennasFetched: boolean;
	private antennas: MiAntenna[];

	private getCombinedNoteText(note: MiNote | Packed<'Note'>): string {
		return [note.text, note.cw]
			.filter((t): t is string => t != null && t !== '')
			.join('\n');
	}

	private escapeRegExp(s: string): string {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// ノートごと・アンテナごとに同じキーワードの正規表現を作り直さないよう使い回す。
	// matchAll は内部で正規表現を複製するので、g フラグ付きでも共有して問題ない
	private keywordRegExpCache = new Map<string, RegExp>();
	private static readonly KEYWORD_REGEXP_CACHE_MAX = 10000;

	private getKeywordRegExp(keyword: string, caseSensitive: boolean): RegExp {
		const flags = caseSensitive ? 'gu' : 'gui';
		const cacheKey = `${flags}:${keyword}`;
		let regex = this.keywordRegExpCache.get(cacheKey);
		if (regex != null) {
			// Map は挿入順を保つので、使ったものを末尾に移して LRU にする
			this.keywordRegExpCache.delete(cacheKey);
		} else {
			regex = new RegExp(`(?=(${this.escapeRegExp(keyword)}))`, flags);
			if (this.keywordRegExpCache.size >= AntennaService.KEYWORD_REGEXP_CACHE_MAX) {
				// いちばん長く使われていないものを捨てる
				const oldest = this.keywordRegExpCache.keys().next().value;
				if (oldest != null) this.keywordRegExpCache.delete(oldest);
			}
		}
		this.keywordRegExpCache.set(cacheKey, regex);
		return regex;
	}

	@bindThis
	public findAllMatches(text: string, keywords: string[], caseSensitive: boolean): Match[] {
		if (!text) return [];
		const matches: Match[] = [];

		for (const keyword of keywords) {
			if (!keyword) continue;
			const regex = this.getKeywordRegExp(keyword, caseSensitive);

			for (const match of text.matchAll(regex)) {
				matches.push({
					keyword: keyword,
					start: match.index!,
					end: match.index! + match[1].length,
				});
			}
		}
		return matches;
	}

	@bindThis
	public deduplicateOverlappingMatches(matches: Match[]): Match[] {
		if (matches.length === 0) return [];

		// キーワードごとにグループ化して重複排除
		const byKeyword = new Map<string, Match[]>();
		for (const m of matches) {
			if (!byKeyword.has(m.keyword)) {
				byKeyword.set(m.keyword, []);
			}
			byKeyword.get(m.keyword)!.push(m);
		}

		const result: Match[] = [];
		for (const [, keywordMatches] of byKeyword) {
			// 同一キーワード内でのみ重複排除
			const sorted = [...keywordMatches].sort((a, b) => a.start - b.start);
			let lastEnd = -1;
			for (const match of sorted) {
				if (match.start >= lastEnd) {
					result.push(match);
					lastEnd = match.end;
				}
			}
		}
		return result;
	}

	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private loggerService: LoggerService,
		private cacheService: CacheService,
		private utilityService: UtilityService,
		private globalEventService: GlobalEventService,
		private fanoutTimelineService: FanoutTimelineService,
	) {
		this.logger = this.loggerService.getLogger('antenna');
		this.antennasFetched = false;
		this.antennas = [];

		this.redisForSub.on('message', this.onRedisMessage);
	}

	@bindThis
	private async onRedisMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'antennaCreated':
					this.antennas.push({ // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
						...body,
						lastUsedAt: new Date(body.lastUsedAt),
						user: null, // joinなカラムは通常取ってこないので
						userList: null, // joinなカラムは通常取ってこないので
					});
					break;
				case 'antennaUpdated': {
					const idx = this.antennas.findIndex(a => a.id === body.id);
					if (idx >= 0) {
						this.antennas[idx] = { // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
							...body,
							lastUsedAt: new Date(body.lastUsedAt),
							user: null, // joinなカラムは通常取ってこないので
							userList: null, // joinなカラムは通常取ってこないので
						};
					} else {
						// サーバ起動時にactiveじゃなかった場合、リストに持っていないので追加する必要あり
						this.antennas.push({ // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
							...body,
							lastUsedAt: new Date(body.lastUsedAt),
							user: null, // joinなカラムは通常取ってこないので
							userList: null, // joinなカラムは通常取ってこないので
						});
					}
				}
					break;
				case 'antennaDeleted':
					this.antennas = this.antennas.filter(a => a.id !== body.id);
					break;
				default:
					break;
			}
		}
	}

	@bindThis
	public async addNoteToAntennas(note: MiNote, noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<{ antenna: MiAntenna; match: AntennaMatchInfo }[]> {
		const antennas = await this.getAntennas();
		const results = await Promise.all(antennas.map(async (antenna) => {
			try {
				const hit = await this.checkHitAntenna(antenna, note, noteUser);
				if (!hit) return null;
				return { antenna, match: this.getAntennaMatchInfo(antenna, note) };
			} catch (err) {
				// 判定に失敗したアンテナは不一致扱い(除外側)にして、他のアンテナへの配信とノート作成全体を止めない
				this.logger.warn(`Failed to check antenna hit (antenna: ${antenna.id}, note: ${note.id})`, { err });
				return null;
			}
		}));
		const matchedAntennas = results.filter((x): x is NonNullable<typeof x> => x != null);

		const redisPipeline = this.redisForTimelines.pipeline();

		for (const { antenna } of matchedAntennas) {
			this.fanoutTimelineService.push(`antennaTimeline:${antenna.id}`, note.id, 200, redisPipeline);
		}

		redisPipeline.exec();

		return matchedAntennas;
	}

	// NOTE: フォローしているユーザーのノート、リストのユーザーのノート、グループのユーザーのノート指定はパフォーマンス上の理由で無効になっている

	@bindThis
	public async checkHitAntenna(antenna: MiAntenna, note: (MiNote | Packed<'Note'>), noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<boolean> {
		if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) return false;

		if (antenna.excludeBots && noteUser.isBot) return false;

		if (antenna.localOnly && noteUser.host != null) return false;

		if (!antenna.withReplies && note.replyId != null) return false;

		if (note.visibility === 'specified') {
			if (note.userId !== antenna.userId) {
				if (note.visibleUserIds == null) return false;
				if (!note.visibleUserIds.includes(antenna.userId)) return false;
			}
		}

		if (note.visibility === 'followers') {
			const isFollowing = Object.hasOwn(await this.cacheService.userFollowingsCache.fetch(antenna.userId), note.userId);
			if (!isFollowing && antenna.userId !== note.userId) return false;
		}

		if (antenna.onlyFollowers) {
			// Don't filter notes from the antenna owner
			if (antenna.userId !== note.userId) {
				// Check if the note author is a follower of the antenna owner.
				// This is equivalent to checking if the antenna owner is being followed by the note author.
				const isFollower = Object.hasOwn(await this.cacheService.userFollowingsCache.fetch(note.userId), antenna.userId);
				if (!isFollower) return false;
			}
		}

		if (antenna.src === 'home') {
			// TODO
		} else if (antenna.src === 'list') {
			if (antenna.userListId == null) return false;
			const exists = await this.userListMembershipsRepository.exists({
				where: {
					userListId: antenna.userListId,
					userId: note.userId,
				},
			});
			if (!exists) return false;
		} else if (antenna.src === 'users') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			if (!accts.includes(this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase())) return false;
		} else if (antenna.src === 'users_blacklist') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			if (accts.includes(this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase())) return false;
		}

		const keywordResult = this.evaluateKeywordMatch(antenna, note);
		if (!keywordResult.hit) return false;

		// 表示側(取得API・ストリーム)と同じく、ミュートしているユーザーと自分をブロックしているユーザーが関わるノートを受信時にも除外する
		const relatedUserIds = this.getNoteRelatedUserIds(note).filter(id => id !== antenna.userId);
		if (relatedUserIds.length > 0) {
			const [mutingUserIds, blockingUserIds] = await Promise.all([
				this.cacheService.userMutingsCache.fetch(antenna.userId),
				this.cacheService.userBlockedCache.fetch(antenna.userId),
			]);
			if (relatedUserIds.some(id => mutingUserIds.has(id) || blockingUserIds.has(id))) return false;
		}

		if (antenna.withFile) {
			if (note.fileIds && note.fileIds.length === 0) return false;
		}

		// TODO: eval expression

		return true;
	}

	/**
	 * キーワード条件の評価。ヒットするかどうかに加えて、マッチしたグループ(マッチ理由)を返す。
	 * mustExcludeKeywords・SCOREモード・通常モードの意味は従来どおり。
	 */
	@bindThis
	public evaluateKeywordMatch(antenna: MiAntenna, note: (MiNote | Packed<'Note'>)): { hit: boolean } & AntennaMatchInfo {
		const noMatch: { hit: boolean } & AntennaMatchInfo = { hit: false, matchedKeywords: [], matchedExcludeKeywords: [] };

		// 強制除外ワードは、スコアリングモード利用時のみ有効とする
		if (antenna.expression === 'SCORE') {
			const mustExcludeKeywords = antenna.mustExcludeKeywords
				// Clean up
				.map(xs => xs.filter(x => x !== ''))
				.filter(xs => xs.length > 0);

			if (mustExcludeKeywords.length > 0) {
				if (note.text != null || note.cw != null) {
					const _text = this.getCombinedNoteText(note);

					const matched = mustExcludeKeywords.some(and =>
						and.every(keyword => this.includesKeyword(_text, keyword, antenna.caseSensitive)));

					if (matched) return noMatch;
				}
			}
		}

		const keywords = antenna.keywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);

		const excludeKeywords = antenna.excludeKeywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);

		if (antenna.expression === 'SCORE') {
			let score = 0;
			const metIncludeGroups: string[][] = [];
			const metExcludeGroups: string[][] = [];

			if (keywords.length > 0 || excludeKeywords.length > 0) {
				if (note.text != null || note.cw != null) {
					const _text = this.getCombinedNoteText(note);
					const collectMatches = (keywordGroups: string[][], type: 'include' | 'exclude'): Match[] => {
						return keywordGroups.flatMap((and, groupIdx) =>
							this.findAllMatches(_text, and, antenna.caseSensitive).map(match => ({
								...match,
								groupIndex: groupIdx,
								type: type,
							})),
						);
					};

					const allMatches: Match[] = [
						...collectMatches(keywords, 'include'),
						...collectMatches(excludeKeywords, 'exclude'),
					];

					// グループごと（type, groupIndex）に重複排除を行い、独立評価
					const validMatchesMap = new Map<string, Match[]>();
					const groupBy = (m: Match) => `${m.type}:${m.groupIndex}`;

					const groupedMatches = new Map<string, Match[]>();
					for (const match of allMatches) {
						const key = groupBy(match);
						if (!groupedMatches.has(key)) {
							groupedMatches.set(key, []);
						}
						groupedMatches.get(key)!.push(match);
					}

					// 各グループ内で重複排除
					for (const [key, matches] of groupedMatches) {
						validMatchesMap.set(key, this.deduplicateOverlappingMatches(matches));
					}

					// スコア計算とマッチしたグループの収集
					const collectMetGroups = (keywordGroups: string[][], type: 'include' | 'exclude'): string[][] => {
						return keywordGroups.filter((and, i) => {
							const groupMatches = validMatchesMap.get(`${type}:${i}`) || [];
							// このグループ内のすべてのキーワードについて、少なくとも1つの有効なものが存在するか確認
							return and.every(kw => groupMatches.some(m => m.keyword === kw));
						});
					};

					metIncludeGroups.push(...collectMetGroups(keywords, 'include'));
					metExcludeGroups.push(...collectMetGroups(excludeKeywords, 'exclude'));
					score = metIncludeGroups.length - metExcludeGroups.length;
				}
			}

			if (keywords.length > 0 && score <= 0) return noMatch;
			if (keywords.length === 0 && excludeKeywords.length > 0 && score < 0) return noMatch;

			return { hit: true, matchedKeywords: metIncludeGroups, matchedExcludeKeywords: metExcludeGroups };
		} else {
			const matchedKeywords: string[][] = [];

			if (keywords.length > 0) {
				if (note.text == null && note.cw == null) return noMatch;

				const _text = this.getCombinedNoteText(note);

				for (const and of keywords) {
					if (and.every(keyword => this.includesKeyword(_text, keyword, antenna.caseSensitive))) {
						matchedKeywords.push(and);
					}
				}

				if (matchedKeywords.length === 0) return noMatch;
			}

			if (excludeKeywords.length > 0) {
				if (note.text != null || note.cw != null) {
					const _text = this.getCombinedNoteText(note);

					const matched = excludeKeywords.some(and =>
						and.every(keyword => this.includesKeyword(_text, keyword, antenna.caseSensitive)));

					if (matched) return noMatch;
				}
			}

			return { hit: true, matchedKeywords, matchedExcludeKeywords: [] };
		}
	}

	// 表示用: 現在の条件でどのキーワードグループにマッチするかを再計算する(受信当時の理由の復元ではない)
	@bindThis
	public getAntennaMatchInfo(antenna: MiAntenna, note: (MiNote | Packed<'Note'>)): AntennaMatchInfo {
		const result = this.evaluateKeywordMatch(antenna, note);
		return {
			matchedKeywords: result.matchedKeywords,
			matchedExcludeKeywords: result.matchedExcludeKeywords,
		};
	}

	// ノートの作者・返信先の作者・リノート元の作者のIDを集める(MiNoteとPacked<'Note'>の両方に対応)
	private getNoteRelatedUserIds(note: MiNote | Packed<'Note'>): MiUser['id'][] {
		const ids = new Set<MiUser['id']>([note.userId]);
		const replyUserId = 'replyUserId' in note ? note.replyUserId : note.reply?.userId ?? null;
		const renoteUserId = 'renoteUserId' in note ? note.renoteUserId : note.renote?.userId ?? null;
		if (replyUserId != null) ids.add(replyUserId);
		if (renoteUserId != null) ids.add(renoteUserId);
		return [...ids];
	}

	private includesKeyword(text: string, keyword: string, caseSensitive: boolean): boolean {
		return caseSensitive
			? text.includes(keyword)
			: text.toLowerCase().includes(keyword.toLowerCase());
	}

	@bindThis
	public async getAntennas() {
		if (!this.antennasFetched) {
			this.antennas = await this.antennasRepository.findBy({
				isActive: true,
			});
			this.antennasFetched = true;
		}

		return this.antennas;
	}

	@bindThis
	public async onMoveAccount(src: MiUser, dst: MiUser): Promise<void> {
		// There is a possibility for users to add the srcUser to their antennas, but it's low, so we don't check it.

		// Get MiAntenna[] from cache and filter to select antennas with the src user is in the users list
		const srcUserAcct = this.utilityService.getFullApAccount(src.username, src.host).toLowerCase();
		const antennasToMigrate = (await this.getAntennas()).filter(antenna => {
			return antenna.users.some(user => {
				const { username, host } = Acct.parse(user);
				return this.utilityService.getFullApAccount(username, host).toLowerCase() === srcUserAcct;
			});
		});

		if (antennasToMigrate.length === 0) return;

		const antennaIds = antennasToMigrate.map(x => x.id);

		// Update the antennas by appending dst users acct to the users list
		const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

		await this.antennasRepository.createQueryBuilder('antenna')
			.update()
			.set({
				users: () => 'array_append(antenna.users, :dstUserAcct)',
			})
			.where('antenna.id IN (:...antennaIds)', { antennaIds })
			.setParameters({ dstUserAcct })
			.execute();

		// announce update to event
		for (const newAntenna of await this.antennasRepository.findBy({ id: In(antennaIds) })) {
			this.globalEventService.publishInternalEvent('antennaUpdated', newAntenna);
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onRedisMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
