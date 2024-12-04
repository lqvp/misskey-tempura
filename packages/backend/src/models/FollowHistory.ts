/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('follow_history')
export class MiFollowHistory {
    @PrimaryColumn(id())
	public id: string;

    @Column('varchar', {
    	length: 32,
    	comment: 'アクションの種類 (follow, unFollow, wasFollow, wasUnFollow, blocked, unBlocked, wasBlocked, wasUnBlocked).',
    })
    public type: 'follow' | 'unFollow' | 'wasFollow' | 'wasUnFollow' | 'blocked' | 'unBlocked' | 'wasBlocked' | 'wasUnBlocked';

    @Index('IDX_follow_history_from_user_id')
    @Column({
    	...id(),
    	comment: 'フォローリクエストを送信したユーザー。',
    })
    public fromUserId: MiUser['id'];

    @ManyToOne(type => MiUser, {
    	onDelete: 'CASCADE',
    })
    @JoinColumn()
    public fromUser: MiUser | null;

    @Index('IDX_follow_history_to_user_id')
    @Column({
    	...id(),
    	comment: 'フォローリクエストを受信したユーザー。',
    })
    public toUserId: MiUser['id'];

    @ManyToOne(type => MiUser, {
    	onDelete: 'CASCADE',
    })
    @JoinColumn()
    public toUser: MiUser | null;

    @Index('IDX_follow_history_timestamp')
    @Column('timestamp with time zone', {
    	comment: '履歴レコードの作成日時。',
    })
    public timestamp: Date;
}
