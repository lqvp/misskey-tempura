/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('follow_request_history')
export class MiFollowRequestHistory {
    @PrimaryColumn(id())
	public id: string;

    @Column('varchar', {
    	length: 32,
    	comment: 'The type of the action (sent, received, approved, rejected, wasApproved, wasRejected, wasBlocked, wasUnBlocked).',
    })
    public type: 'sent' | 'received' | 'approved' | 'rejected' | 'wasApproved' | 'wasRejected' | 'wasBlocked' | 'wasUnBlocked';

    @Index('IDX_follow_request_history_from_user_id')
    @Column({
    	...id(),
    	comment: 'The user who sent the follow request.',
    })
    public fromUserId: MiUser['id'];

    @ManyToOne(type => MiUser, {
    	onDelete: 'CASCADE',
    })
    @JoinColumn()
    public fromUser: MiUser | null;

    @Index('IDX_follow_request_history_to_user_id')
    @Column({
    	...id(),
    	comment: 'The user who received the follow request.',
    })
    public toUserId: MiUser['id'];

    @ManyToOne(type => MiUser, {
    	onDelete: 'CASCADE',
    })
    @JoinColumn()
    public toUser: MiUser | null;

    @Index('IDX_follow_request_history_timestamp')
    @Column('timestamp with time zone', {
    	comment: 'The created date of the history record.',
    })
    public timestamp: Date;
}
