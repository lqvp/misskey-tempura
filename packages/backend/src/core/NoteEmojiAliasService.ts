/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, MiMeta, NoteEmojiAliasesRepository } from '@/models/_.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { MiNoteEmojiAlias } from '@/models/NoteEmojiAlias.js';
import { IdService } from '@/core/IdService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';

const ALIAS_PREFIX = 're_';
const ALIAS_MAX_LENGTH = 100;

import { NOTE_EMOJI_ALIAS_REGEXP } from '@/misc/note-emoji-alias.js';
export { NOTE_EMOJI_ALIAS_REGEXP } from '@/misc/note-emoji-alias.js';

@Injectable()
export class NoteEmojiAliasService {
	private aliasCache: MemoryKVCache<MiNoteEmojiAlias | null>;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		@Inject(DI.noteEmojiAliasesRepository)
		private noteEmojiAliasesRepository: NoteEmojiAliasesRepository,

		private idService: IdService,
		private customEmojiService: CustomEmojiService,
		private utilityService: UtilityService,
	) {
		this.aliasCache = new MemoryKVCache<MiNoteEmojiAlias | null>(1000 * 60 * 60); // 1h
	}

	/**
	 * 連合向けの安全なショートコードを生成する。
	 * [A-Za-z0-9_] のみ・100文字以内 (MFM 0.28 の emojiCode と Mastodon の shortcode の双方を満たす)。
	 * (host, name) から決定的に生成するため、同じ元絵文字は常に同じ alias になる。
	 */
	@bindThis
	private makeAlias(name: string, host: string, digestLength: number): string {
		const digest = createHash('sha256').update(`${host}/${name}`).digest('hex').slice(0, digestLength);
		const safeName = name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'emoji';
		return `${ALIAS_PREFIX}${safeName}_${digest}`.slice(0, ALIAS_MAX_LENGTH);
	}

	/**
	 * alias 文字列から参照を引く (見つからなければ null)
	 */
	@bindThis
	public async findByAlias(alias: string): Promise<MiNoteEmojiAlias | null> {
		return await this.aliasCache.fetch(alias, () => this.noteEmojiAliasesRepository.findOneBy({ alias }));
	}

	/**
	 * リモート絵文字 (name + host) に対応する参照を取得する。無ければ新規に発行する。
	 * 元絵文字が emoji テーブル (連合済みキャッシュ) に存在しない場合は null を返す。
	 * 呼び出し側で絵文字の利用可否 (localOnly, mediaSilenced 等) を検証すること。
	 */
	@bindThis
	public async resolve(name: string, host: string): Promise<{ alias: MiNoteEmojiAlias; emoji: MiEmoji } | null> {
		const normalizedHost = this.utilityService.toPuny(host);
		if (this.utilityService.isSelfHost(normalizedHost)) return null;

		const emoji = await this.emojisRepository.findOneBy({ name, host: normalizedHost });
		if (emoji == null) return null;

		// localOnly の絵文字は参照を発行しない (発行済み行が残っている場合も使わせない)
		if (emoji.localOnly) return null;

		const existing = await this.noteEmojiAliasesRepository.findOneBy({ name, host: normalizedHost });
		if (existing != null) {
			this.aliasCache.set(existing.alias, existing);
			return { alias: existing, emoji };
		}

		const localEmojis = await this.customEmojiService.localEmojisCache.fetch();

		for (const digestLength of [8, 16, 32]) {
			const alias = this.makeAlias(name, normalizedHost, digestLength);

			// 別の出自で同じ alias が使われている、または同名のローカル絵文字がある場合はダイジェストを伸ばして再試行
			const conflict = await this.noteEmojiAliasesRepository.findOneBy({ alias });
			if (conflict != null) continue;
			if (localEmojis.has(alias)) continue;

			const record = this.noteEmojiAliasesRepository.create({
				id: this.idService.gen(),
				createdAt: new Date(),
				updatedAt: null,
				alias,
				name: emoji.name,
				host: normalizedHost,
				uri: emoji.uri,
				originalUrl: emoji.originalUrl,
				publicUrl: emoji.publicUrl,
				type: emoji.type,
				isSensitive: emoji.isSensitive,
				license: emoji.license,
			});

			try {
				await this.noteEmojiAliasesRepository.insert(record);
				this.aliasCache.set(record.alias, record);
				return { alias: record, emoji };
			} catch (e) {
				if (isDuplicateKeyValueError(e)) {
					// 同時挿入。既存行を読み直して返す
					const concurrent = await this.noteEmojiAliasesRepository.findOneBy({ name, host: normalizedHost });
					if (concurrent != null) {
						this.aliasCache.set(concurrent.alias, concurrent);
						return { alias: concurrent, emoji };
					}
					continue;
				}
				throw e;
			}
		}

		return null;
	}

	/**
	 * 現行のキャッシュ状態でこの参照が新規利用に耐えるかを返す。
	 * 元絵文字が localOnly 化している、または元ホストが media-silence されている場合は true (利用不可)。
	 * 既存ノート・リアクションの表示経路では呼ばないこと (表示履歴を壊さないため)。
	 */
	@bindThis
	public async isCurrentlyUnusable(alias: MiNoteEmojiAlias): Promise<boolean> {
		const origin = await this.emojisRepository.findOneBy({ name: alias.name, host: alias.host });
		if (origin != null && origin.localOnly) return true;
		return this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, alias.host);
	}

	/**
	 * 新規ノートの emojis から、現行状態で利用不可な参照 (エイリアス) 名を取り除く。
	 * 参照行が存在しない名前はそのまま残す (従来どおり描画されないだけ)。
	 */
	@bindThis
	public async filterUnusableAliases(names: string[]): Promise<string[]> {
		const aliasNames = names.filter(n => NOTE_EMOJI_ALIAS_REGEXP.test(n));
		if (aliasNames.length === 0) return names;
		const blocked = new Set<string>();
		for (const aliasName of aliasNames) {
			const row = await this.findByAlias(aliasName);
			if (row != null && await this.isCurrentlyUnusable(row)) {
				blocked.add(aliasName);
			}
		}
		if (blocked.size === 0) return names;
		return names.filter(n => !blocked.has(n));
	}

	/**
	 * 添付用のカスタム絵文字名の集合から、エイリアス参照のURL辞書を作る。
	 * host 指定を含むものやローカル絵文字と同名のものは対象外 (ローカル絵文字が常に優先)。
	 * @param emojiNames ノートの emojis (素の名前) やリアクション文字列 (`:name:` 形式)
	 */
	@bindThis
	public async populateAliases(emojiNames: string[]): Promise<Record<string, string>> {
		const res: Record<string, string> = {};
		if (emojiNames.length === 0) return res;

		const candidates = new Set<string>();
		for (const raw of emojiNames) {
			const name = raw.replaceAll(':', '');
			if (name === '' || name.includes('@')) continue;
			candidates.add(name);
		}
		if (candidates.size === 0) return res;

		const localEmojis = await this.customEmojiService.localEmojisCache.fetch();

		const toFetch: string[] = [];
		for (const name of candidates) {
			if (localEmojis.has(name)) continue;
			const cached = this.aliasCache.get(name);
			if (cached === undefined) {
				toFetch.push(name);
			} else if (cached != null) {
				res[name] = cached.publicUrl || cached.originalUrl;
			}
		}

		if (toFetch.length > 0) {
			const found = await this.noteEmojiAliasesRepository.findBy({ alias: In(toFetch) });
			for (const name of toFetch) {
				const row = found.find(x => x.alias === name) ?? null;
				this.aliasCache.set(name, row);
				if (row != null) {
					res[name] = row.publicUrl || row.originalUrl;
				}
			}
		}

		return res;
	}
}
