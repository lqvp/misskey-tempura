/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('avatar_decoration_muting')
@Index(['muterId', 'muteeId'], { unique: true })
export class MiAvatarDecorationMuting {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The mutee user ID.',
	})
	public muteeId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public mutee: MiUser | null;

	@Index()
	@Column({
		...id(),
		comment: 'The muter user ID.',
	})
	public muterId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public muter: MiUser | null;
}
