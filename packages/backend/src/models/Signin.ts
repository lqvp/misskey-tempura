/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('signin')
export class MiSignin {
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
		length: 128,
	})
	public ip: string;

	@Column('jsonb')
	public headers: Record<string, any>;

	@Column('boolean')
	public success: boolean;

	@Column('varchar', {
		length: 2,
		nullable: true,
	})
	public country: string | null;

	@Column('integer', {
		nullable: true,
	})
	public asn: number | null;

	@Column('smallint', {
		nullable: true,
	})
	public riskScore: number | null;

	@Column('varchar', {
		length: 32,
		array: true,
		default: '{}',
	})
	public riskReasons: string[];

	@Column('varchar', {
		length: 16,
		nullable: true,
	})
	public challenge: 'emailCode' | 'passed' | 'failed' | null;
}
