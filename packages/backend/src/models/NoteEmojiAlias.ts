/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column } from 'typeorm';
import { id } from './util/id.js';

/**
 * ノート本文でリモート絵文字を使うための参照(エイリアス)。
 * ローカル絵文字(emoji.host IS NULL)とは別のストアで、ローカル絵文字一覧には登録されない。
 * alias は連合向けの安全なショートコード ([A-Za-z0-9_] のみ) で、
 * name + host + uri が元絵文字の来歴を表す。
 */
@Entity('note_emoji_alias')
@Index(['name', 'host'], { unique: true })
export class MiNoteEmojiAlias {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public updatedAt: Date | null;

	/**
	 * ノート本文や連合で使われる安全なショートコード (`re_` prefix + ダイジェスト)
	 */
	@Index({ unique: true })
	@Column('varchar', {
		length: 128,
	})
	public alias: string;

	/**
	 * 元絵文字のショートコード
	 */
	@Index()
	@Column('varchar', {
		length: 128,
	})
	public name: string;

	/**
	 * 元絵文字のホスト (punycode 正規化済み)
	 */
	@Index()
	@Column('varchar', {
		length: 128,
	})
	public host: string;

	/**
	 * 元絵文字の ActivityPub URI (来歴。再取得には使わない)
	 */
	@Column('varchar', {
		length: 512, nullable: true,
	})
	public uri: string | null;

	@Column('varchar', {
		length: 512,
	})
	public originalUrl: string;

	@Column('varchar', {
		length: 512,
		default: '',
	})
	public publicUrl: string;

	// publicUrlの方のtypeが入る
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public type: string | null;

	@Column('boolean', {
		default: false,
	})
	public isSensitive: boolean;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public license: string | null;
}
