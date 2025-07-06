/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In, IsNull, Not } from 'typeorm';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { MemoryKVCache, RedisSingleCache } from '@/misc/cache.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { DriveFilesRepository, EmojisRepository, MiRole, MiUser } from '@/models/_.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { Serialized } from '@/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DriveService } from '@/core/DriveService.js';
import Logger from '@/logger.js';
import { LoggerService } from './LoggerService.js';

const parseEmojiStrRegexp = /^([-\w]+)(?:@([\w.-]+))?$/;

export const fetchEmojisHostTypes = [
	'local',
	'remote',
	'all',
] as const;
export type FetchEmojisHostTypes = typeof fetchEmojisHostTypes[number];
export const fetchEmojisSortKeys = [
	'+id',
	'-id',
	'+updatedAt',
	'-updatedAt',
	'+name',
	'-name',
	'+host',
	'-host',
	'+uri',
	'-uri',
	'+publicUrl',
	'-publicUrl',
	'+type',
	'-type',
	'+aliases',
	'-aliases',
	'+category',
	'-category',
	'+license',
	'-license',
	'+isSensitive',
	'-isSensitive',
	'+localOnly',
	'-localOnly',
	'+roleIdsThatCanBeUsedThisEmojiAsReaction',
	'-roleIdsThatCanBeUsedThisEmojiAsReaction',
] as const;
export type FetchEmojisSortKeys = typeof fetchEmojisSortKeys[number];

@Injectable()
export class CustomEmojiService implements OnApplicationShutdown {
	private emojisCache: MemoryKVCache<MiEmoji | null>;
	public localEmojisCache: RedisSingleCache<Map<string, MiEmoji>>;
	private readonly logger: Logger;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private utilityService: UtilityService,
		private idService: IdService,
		private emojiEntityService: EmojiEntityService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		private driveService: DriveService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('customEmojiService');

		this.emojisCache = new MemoryKVCache<MiEmoji | null>(1000 * 60 * 60 * 12); // 12h

		this.localEmojisCache = new RedisSingleCache<Map<string, MiEmoji>>(this.redisClient, 'localEmojis', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60 * 3, // 3m
			fetcher: () => this.emojisRepository.find({ where: { host: IsNull() } }).then(emojis => new Map(emojis.map(emoji => [emoji.name, emoji]))),
			toRedisConverter: (value) => JSON.stringify(Array.from(value.values())),
			fromRedisConverter: (value) => {
				return new Map(JSON.parse(value).map((x: Serialized<MiEmoji>) => [x.name, {
					...x,
					updatedAt: x.updatedAt ? new Date(x.updatedAt) : null,
				}]));
			},
		});
	}

	/**
	 * 絵文字名のバリデーション
	 * @param emojiName バリデーション対象の絵文字名
	 * @returns バリデーション結果
	 */
	@bindThis
	private validateEmojiName(emojiName: string): boolean {
		// 絵文字名の基本的なバリデーション
		if (!emojiName || typeof emojiName !== 'string') {
			return false;
		}

		// 長さチェック（最大128文字）
		if (emojiName.length > 128) {
			return false;
		}

		// 使用可能文字のチェック（英数字、ハイフン、アンダースコア）
		const validPattern = /^[a-zA-Z0-9_-]+$/;
		if (!validPattern.test(emojiName)) {
			return false;
		}

		return true;
	}

	@bindThis
	public async add(data: {
		originalUrl: string;
		publicUrl: string;
		fileType: string;
		name: string;
		category: string | null;
		aliases: string[];
		host: string | null;
		license: string | null;
		isSensitive: boolean;
		localOnly: boolean;
		roleIdsThatCanBeUsedThisEmojiAsReaction: MiRole['id'][];
	}, moderator?: MiUser): Promise<MiEmoji> {
		// 絵文字名のバリデーション
		if (!this.validateEmojiName(data.name)) {
			throw new Error(`Invalid emoji name: ${data.name}`);
		}

		// システムとして再アップロードする
		const uploadResult = await this.systemReupload(data.originalUrl, data.name);

		// data の更新 - ファイルのURLを使用
		data.originalUrl = uploadResult.url;
		data.publicUrl = uploadResult.webpublicUrl ?? uploadResult.url;
		data.fileType = uploadResult.webpublicType ?? uploadResult.type;

		const emoji = await this.emojisRepository.insertOne({
			id: this.idService.gen(),
			updatedAt: new Date(),
			name: data.name,
			category: data.category,
			host: data.host,
			aliases: data.aliases,
			originalUrl: data.originalUrl,
			publicUrl: data.publicUrl,
			type: data.fileType,
			license: data.license,
			isSensitive: data.isSensitive,
			localOnly: data.localOnly,
			roleIdsThatCanBeUsedThisEmojiAsReaction: data.roleIdsThatCanBeUsedThisEmojiAsReaction,
		});

		if (data.host == null) {
			this.localEmojisCache.refresh();

			this.globalEventService.publishBroadcastStream('emojiAdded', {
				emoji: await this.emojiEntityService.packDetailed(emoji.id),
			});

			if (moderator) {
				this.moderationLogService.log(moderator, 'addCustomEmoji', {
					emojiId: emoji.id,
					emoji: emoji,
				});
			}
		}

		return emoji;
	}

	/**
	 * システムユーザーとして絵文字ファイルを再アップロードする
	 * @param originalUrl 元のファイルURL
	 * @param emojiName 絵文字名（ログ用）
	 * @returns アップロードされたファイル情報
	 */
	@bindThis
	private async systemReupload(originalUrl: string, emojiName: string): Promise<MiDriveFile> {
		// 絵文字名のバリデーション
		if (!this.validateEmojiName(emojiName)) {
			throw new Error(`Invalid emoji name for system reupload: ${emojiName}`);
		}

		const MAX_RETRY_COUNT = 3;
		let retryCount = 0;
		let copyDriveFile: MiDriveFile | undefined;
		const errors: string[] = [];

		// 元のURLを保存しておく
		const originalSourceUrl = originalUrl;

		while (retryCount < MAX_RETRY_COUNT) {
			try {
				// システムとして再アップロードする
				copyDriveFile = await this.driveService.uploadFromUrl({
					url: originalSourceUrl,
					user: null,
					force: true,
				});

				// アップロード成功したらループ終了
				break;
			} catch (e) {
				retryCount++;
				this.logger.warn(`Failed to upload custom emoji (attempt ${retryCount}/${MAX_RETRY_COUNT})`, {
					error: e instanceof Error ? e.message : String(e),
					stack: e instanceof Error ? e.stack : undefined,
					originalUrl: originalSourceUrl,
					name: emojiName,
				});

				errors.push(e instanceof Error ? e.message : String(e));

				// 最大リトライ回数に達したらエラーを投げる
				if (retryCount >= MAX_RETRY_COUNT) {
					this.logger.error('Maximum retry count reached for custom emoji upload', {
						error: e instanceof Error ? e.message : String(e),
						originalUrl: originalSourceUrl,
						name: emojiName,
					});
					throw new Error(`Failed to process custom emoji upload after ${MAX_RETRY_COUNT} attempts: ${errors.join('; ')}`);
				}

				// 少し待ってからリトライ
				await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
			}
		}

		// この時点でcopyDriveFileは必ず存在するはず
		if (!copyDriveFile) {
			throw new Error('Emoji upload succeeded but drive file is undefined. This should never happen.');
		}

		// オリジナルのファイル削除処理は元のURLとの比較が必要な場合のみ行う
		if (originalSourceUrl !== copyDriveFile.url) {
			try {
				const originalDriveFile = await this.driveFilesRepository.findOneBy({ url: originalSourceUrl });
				if (originalDriveFile && originalDriveFile.id !== copyDriveFile.id) {
					// 別のファイルなので削除を検討
					const referenceCount = await this.driveFilesRepository.count({
						where: { url: originalSourceUrl, id: Not(originalDriveFile.id) },
					});

					// 参照カウントが0（このファイルのみ）なら削除
					if (referenceCount === 0) {
						await this.driveService.deleteFile(originalDriveFile);
						this.logger.info('Deleted original emoji file as it\'s no longer referenced', {
							fileId: originalDriveFile.id,
							url: originalSourceUrl,
						});
					} else {
						this.logger.info(`Skipped deleting original emoji file as it has ${referenceCount} references`, {
							fileId: originalDriveFile.id,
							url: originalSourceUrl,
						});
					}
				}
			} catch (e) {
				// 元ファイルの削除に失敗しても処理は続行
				this.logger.warn('Failed to delete original emoji file', {
					error: e instanceof Error ? e.message : String(e),
					originalUrl: originalSourceUrl,
				});
			}
		}

		return copyDriveFile;
	}

	@bindThis
	public async update(data: (
		{ id: MiEmoji['id'], name?: string; } | { name: string; id?: MiEmoji['id'], }
		) & {
			originalUrl?: string;
			publicUrl?: string;
			fileType?: string;
			category?: string | null;
			aliases?: string[];
			license?: string | null;
			isSensitive?: boolean;
			localOnly?: boolean;
			roleIdsThatCanBeUsedThisEmojiAsReaction?: MiRole['id'][];
		}, moderator?: MiUser): Promise<
		null
		| 'NO_SUCH_EMOJI'
		| 'SAME_NAME_EMOJI_EXISTS'
		> {
		const emoji = data.id
			? await this.getEmojiById(data.id)
			: await this.getEmojiByName(data.name!);
		if (emoji === null) return 'NO_SUCH_EMOJI';
		const id = emoji.id;

		// IDと絵文字名が両方指定されている場合は絵文字名の変更を行うため重複チェックが必要
		const doNameUpdate = data.id && data.name && (data.name !== emoji.name);
		if (doNameUpdate) {
			// 新しい絵文字名のバリデーション
			if (!this.validateEmojiName(data.name!)) {
				throw new Error(`Invalid emoji name: ${data.name}`);
			}

			const isDuplicate = await this.checkDuplicate(data.name!);
			if (isDuplicate) return 'SAME_NAME_EMOJI_EXISTS';
		}

		// ファイルのURLが変更される場合、システムとして再アップロードする
		let fileUpdateData: any = {};
		if (data.originalUrl && data.originalUrl !== emoji.originalUrl) {
			try {
				const uploadResult = await this.systemReupload(data.originalUrl, emoji.name);
				fileUpdateData = {
					originalUrl: uploadResult.url,
					publicUrl: uploadResult.webpublicUrl ?? uploadResult.url,
					type: uploadResult.webpublicType ?? uploadResult.type,
				};
			} catch (e) {
				this.logger.error('Failed to reupload emoji file during update', {
					error: e instanceof Error ? e.message : String(e),
					emojiId: emoji.id,
					emojiName: emoji.name,
					originalUrl: data.originalUrl,
				});
				throw new Error(`Failed to reupload emoji file: ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		await this.emojisRepository.update(emoji.id, {
			updatedAt: new Date(),
			name: data.name,
			category: data.category,
			aliases: data.aliases,
			license: data.license,
			isSensitive: data.isSensitive,
			localOnly: data.localOnly,
			...fileUpdateData,
			roleIdsThatCanBeUsedThisEmojiAsReaction: data.roleIdsThatCanBeUsedThisEmojiAsReaction ?? undefined,
		});

		this.localEmojisCache.refresh();

		const packed = await this.emojiEntityService.packDetailed(emoji.id);

		if (!doNameUpdate) {
			this.globalEventService.publishBroadcastStream('emojiUpdated', {
				emojis: [packed],
			});
		} else {
			this.globalEventService.publishBroadcastStream('emojiDeleted', {
				emojis: [await this.emojiEntityService.packDetailed(emoji)],
			});

			this.globalEventService.publishBroadcastStream('emojiAdded', {
				emoji: packed,
			});
		}

		if (moderator) {
			const updated = await this.emojisRepository.findOneByOrFail({ id: id });
			this.moderationLogService.log(moderator, 'updateCustomEmoji', {
				emojiId: emoji.id,
				before: emoji,
				after: updated,
			});
		}
		return null;
	}

	@bindThis
	public async addAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		const emojis = await this.emojisRepository.findBy({
			id: In(ids),
		});

		for (const emoji of emojis) {
			await this.emojisRepository.update(emoji.id, {
				updatedAt: new Date(),
				aliases: [...new Set(emoji.aliases.concat(aliases))],
			});
		}

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(ids),
		});
	}

	@bindThis
	public async setAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: new Date(),
			aliases: aliases,
		});

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(ids),
		});
	}

	@bindThis
	public async removeAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		const emojis = await this.emojisRepository.findBy({
			id: In(ids),
		});

		for (const emoji of emojis) {
			await this.emojisRepository.update(emoji.id, {
				updatedAt: new Date(),
				aliases: emoji.aliases.filter(x => !aliases.includes(x)),
			});
		}

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(ids),
		});
	}

	@bindThis
	public async setCategoryBulk(ids: MiEmoji['id'][], category: string | null) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: new Date(),
			category: category,
		});

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(ids),
		});
	}

	@bindThis
	public async setLicenseBulk(ids: MiEmoji['id'][], license: string | null) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: new Date(),
			license: license,
		});

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(ids),
		});
	}

	@bindThis
	public async delete(id: MiEmoji['id'], moderator?: MiUser) {
		const emoji = await this.emojisRepository.findOneByOrFail({ id: id });

		await this.emojisRepository.delete(emoji.id);

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiDeleted', {
			emojis: [await this.emojiEntityService.packDetailed(emoji)],
		});

		if (moderator) {
			this.moderationLogService.log(moderator, 'deleteCustomEmoji', {
				emojiId: emoji.id,
				emoji: emoji,
			});
		}
	}

	@bindThis
	public async deleteBulk(ids: MiEmoji['id'][], moderator?: MiUser) {
		const emojis = await this.emojisRepository.findBy({
			id: In(ids),
		});

		for (const emoji of emojis) {
			await this.emojisRepository.delete(emoji.id);

			if (moderator) {
				this.moderationLogService.log(moderator, 'deleteCustomEmoji', {
					emojiId: emoji.id,
					emoji: emoji,
				});
			}
		}

		this.localEmojisCache.refresh();

		this.globalEventService.publishBroadcastStream('emojiDeleted', {
			emojis: await this.emojiEntityService.packDetailedMany(emojis),
		});
	}

	@bindThis
	private normalizeHost(src: string | undefined, noteUserHost: string | null): string | null {
		// クエリに使うホスト
		let host = src === '.' ? null	// .はローカルホスト (ここがマッチするのはリアクションのみ)
			: src === undefined ? noteUserHost	// ノートなどでホスト省略表記の場合はローカルホスト (ここがリアクションにマッチすることはない)
			: this.utilityService.isSelfHost(src) ? null	// 自ホスト指定
			: (src || noteUserHost);	// 指定されたホスト || ノートなどの所有者のホスト (こっちがリアクションにマッチすることはない)

		host = this.utilityService.toPunyNullable(host);

		return host;
	}

	@bindThis
	public parseEmojiStr(emojiName: string, noteUserHost: string | null) {
		const match = emojiName.match(parseEmojiStrRegexp);
		if (!match) return { name: null, host: null };

		const name = match[1];

		// ホスト正規化
		const host = this.utilityService.toPunyNullable(this.normalizeHost(match[2], noteUserHost));

		return { name, host };
	}

	/**
	 * 添付用(リモート)カスタム絵文字URLを解決する
	 * @param emojiName ノートやユーザープロフィールに添付された、またはリアクションのカスタム絵文字名 (:は含めない, リアクションでローカルホストの場合は@.を付ける (これはdecodeReactionで可能))
	 * @param noteUserHost ノートやユーザープロフィールの所有者のホスト
	 * @returns URL, nullは未マッチを意味する
	 */
	@bindThis
	public async populateEmoji(emojiName: string, noteUserHost: string | null): Promise<string | null> {
		const { name, host } = this.parseEmojiStr(emojiName, noteUserHost);
		if (name == null) return null;
		if (host == null) return null;

		const queryOrNull = async () => (await this.emojisRepository.findOneBy({
			name,
			host,
		})) ?? null;

		const emoji = await this.emojisCache.fetch(`${name} ${host}`, queryOrNull);

		if (emoji == null) return null;
		return emoji.publicUrl || emoji.originalUrl; // || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
	}

	/**
	 * 複数の添付用(リモート)カスタム絵文字URLを解決する (キャシュ付き, 存在しないものは結果から除外される)
	 */
	@bindThis
	public async populateEmojis(emojiNames: string[], noteUserHost: string | null): Promise<Record<string, string>> {
		const emojis = await Promise.all(emojiNames.map(x => this.populateEmoji(x, noteUserHost)));
		const res = {} as Record<string, string>;
		for (let i = 0; i < emojiNames.length; i++) {
			const resolvedEmoji = emojis[i];
			if (resolvedEmoji != null) {
				res[emojiNames[i]] = resolvedEmoji;
			}
		}
		return res;
	}

	/**
	 * 与えられた絵文字のリストをデータベースから取得し、キャッシュに追加します
	 */
	@bindThis
	public async prefetchEmojis(emojis: { name: string; host: string | null; }[]): Promise<void> {
		const notCachedEmojis = emojis.filter(emoji => this.emojisCache.get(`${emoji.name} ${emoji.host}`) == null);
		const emojisQuery: any[] = [];
		const hosts = new Set(notCachedEmojis.map(e => e.host));
		for (const host of hosts) {
			if (host == null) continue;
			emojisQuery.push({
				name: In(notCachedEmojis.filter(e => e.host === host).map(e => e.name)),
				host: host,
			});
		}
		const _emojis = emojisQuery.length > 0 ? await this.emojisRepository.find({
			where: emojisQuery,
			select: ['name', 'host', 'originalUrl', 'publicUrl'],
		}) : [];
		for (const emoji of _emojis) {
			this.emojisCache.set(`${emoji.name} ${emoji.host}`, emoji);
		}
	}

	/**
	 * ローカル内の絵文字に重複がないかチェックします
	 * @param name 絵文字名
	 */
	@bindThis
	public checkDuplicate(name: string): Promise<boolean> {
		return this.emojisRepository.exists({ where: { name, host: IsNull() } });
	}

	@bindThis
	public getEmojiById(id: string): Promise<MiEmoji | null> {
		return this.emojisRepository.findOneBy({ id });
	}

	@bindThis
	public getEmojiByName(name: string): Promise<MiEmoji | null> {
		return this.emojisRepository.findOneBy({ name, host: IsNull() });
	}

	@bindThis
	public async fetchEmojis(
		params?: {
			query?: {
				updatedAtFrom?: string;
				updatedAtTo?: string;
				name?: string;
				host?: string;
				uri?: string;
				publicUrl?: string;
				type?: string;
				aliases?: string;
				category?: string;
				license?: string;
				isSensitive?: boolean;
				localOnly?: boolean;
				hostType?: FetchEmojisHostTypes;
				roleIds?: string[];
			},
			sinceId?: string;
			untilId?: string;
		},
		opts?: {
			limit?: number;
			page?: number;
			sortKeys?: FetchEmojisSortKeys[]
		},
	) {
		function multipleWordsToQuery(words: string) {
			return words.split(/\s/).filter(x => x.length > 0).map(x => `%${sqlLikeEscape(x)}%`);
		}

		const builder = this.emojisRepository.createQueryBuilder('emoji');
		if (params?.query) {
			const q = params.query;
			if (q.updatedAtFrom) {
				// noIndexScan
				builder.andWhere('CAST(emoji.updatedAt AS DATE) >= :updateAtFrom', { updateAtFrom: q.updatedAtFrom });
			}
			if (q.updatedAtTo) {
				// noIndexScan
				builder.andWhere('CAST(emoji.updatedAt AS DATE) <= :updateAtTo', { updateAtTo: q.updatedAtTo });
			}
			if (q.name) {
				builder.andWhere('emoji.name ~~ ANY(ARRAY[:...name])', { name: multipleWordsToQuery(q.name) });
			}

			switch (true) {
				case q.hostType === 'local': {
					builder.andWhere('emoji.host IS NULL');
					break;
				}
				case q.hostType === 'remote': {
					if (q.host) {
						// noIndexScan
						builder.andWhere('emoji.host ~~ ANY(ARRAY[:...host])', { host: multipleWordsToQuery(q.host) });
					} else {
						builder.andWhere('emoji.host IS NOT NULL');
					}
					break;
				}
			}

			if (q.uri) {
				// noIndexScan
				builder.andWhere('emoji.uri ~~ ANY(ARRAY[:...uri])', { uri: multipleWordsToQuery(q.uri) });
			}
			if (q.publicUrl) {
				// noIndexScan
				builder.andWhere('emoji.publicUrl ~~ ANY(ARRAY[:...publicUrl])', { publicUrl: multipleWordsToQuery(q.publicUrl) });
			}
			if (q.type) {
				// noIndexScan
				builder.andWhere('emoji.type ~~ ANY(ARRAY[:...type])', { type: multipleWordsToQuery(q.type) });
			}
			if (q.aliases) {
				// noIndexScan
				const subQueryBuilder = builder.subQuery()
					.select('COUNT(0)', 'count')
					.from(
						sq2 => sq2
							.select('unnest(subEmoji.aliases)', 'alias')
							.addSelect('subEmoji.id', 'id')
							.from('emoji', 'subEmoji'),
						'aliasTable',
					)
					.where('"emoji"."id" = "aliasTable"."id"')
					.andWhere('"aliasTable"."alias" ~~ ANY(ARRAY[:...aliases])', { aliases: multipleWordsToQuery(q.aliases) });

				builder.andWhere(`(${subQueryBuilder.getQuery()}) > 0`);
			}
			if (q.category) {
				builder.andWhere('emoji.category ~~ ANY(ARRAY[:...category])', { category: multipleWordsToQuery(q.category) });
			}
			if (q.license) {
				// noIndexScan
				builder.andWhere('emoji.license ~~ ANY(ARRAY[:...license])', { license: multipleWordsToQuery(q.license) });
			}
			if (q.isSensitive != null) {
				// noIndexScan
				builder.andWhere('emoji.isSensitive = :isSensitive', { isSensitive: q.isSensitive });
			}
			if (q.localOnly != null) {
				// noIndexScan
				builder.andWhere('emoji.localOnly = :localOnly', { localOnly: q.localOnly });
			}
			if (q.roleIds && q.roleIds.length > 0) {
				builder.andWhere('emoji.roleIdsThatCanBeUsedThisEmojiAsReaction && ARRAY[:...roleIds]::VARCHAR[]', { roleIds: q.roleIds });
			}
		}

		if (params?.sinceId) {
			builder.andWhere('emoji.id > :sinceId', { sinceId: params.sinceId });
		}
		if (params?.untilId) {
			builder.andWhere('emoji.id < :untilId', { untilId: params.untilId });
		}

		if (opts?.sortKeys && opts.sortKeys.length > 0) {
			for (const sortKey of opts.sortKeys) {
				const direction = sortKey.startsWith('-') ? 'DESC' : 'ASC';
				const key = sortKey.replace(/^[+-]/, '');
				builder.addOrderBy(`emoji.${key}`, direction);
			}
		} else {
			builder.addOrderBy('emoji.id', 'DESC');
		}

		const limit = opts?.limit ?? 10;
		if (opts?.page) {
			builder.skip((opts.page - 1) * limit);
		}

		builder.take(limit);

		const [emojis, count] = await builder.getManyAndCount();

		return {
			emojis,
			count: (count > limit ? emojis.length : count),
			allCount: count,
			allPages: Math.ceil(count / limit),
		};
	}

	@bindThis
	public dispose(): void {
		this.emojisCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
