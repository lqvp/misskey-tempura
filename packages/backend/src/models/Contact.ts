/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne, Check } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type ContactStatusType = 'pending' | 'inProgress' | 'resolved';

@Entity('contact')
@Check(`"email" IS NOT NULL OR "misskeyUser" IS NOT NULL`)
export class MiContact {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public subject: string;

	@Column('varchar', {
		length: 8192,
	})
	public message: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('varchar', {
		length: 256,
		nullable: true,
	})
	public email: string | null;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public misskeyUser: string | null;

	@Column('varchar', {
		length: 64,
	})
	public category: string;

	@Column('timestamp with time zone', {
		default: () => 'CURRENT_TIMESTAMP',
	})
	public createdAt: Date;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public respondedAt: Date | null;

	@Column('varchar', {
		length: 128,
		default: 'pending',
	})
	public status: ContactStatusType;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public note: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public responseMessage: string | null;

	@Column({
		...id(),
		nullable: true,
	})
	public assigneeId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public assignee: MiUser | null;
}
