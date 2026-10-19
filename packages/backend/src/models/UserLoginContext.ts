/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('user_login_context')
@Index(['userId', 'kind', 'value'], { unique: true })
export class MiUserLoginContext {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 16,
	})
	public kind: 'device' | 'country' | 'asn' | 'prefix';

	// device/prefix は HMAC-SHA256 の hex、country/asn は平文
	@Column('varchar', {
		length: 128,
	})
	public value: string;

	@Column('timestamp with time zone')
	public firstSeenAt: Date;

	@Index()
	@Column('timestamp with time zone')
	public lastSeenAt: Date;

	@Column('integer', {
		default: 1,
	})
	public hits: number;
}
