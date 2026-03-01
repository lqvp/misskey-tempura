/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiNote } from './Note.js';
import { MiUser } from './User.js';

@Entity('llm_moderation_queue')
export class MiLlmModerationQueue {
	@PrimaryColumn(id())
	public id: string;

	@Index('UQ_llm_moderation_queue_noteId', { unique: true })
	@Column(id())
	public noteId: MiNote['id'];

	@Index()
	@Column(id())
	public noteUserId: MiUser['id'];

	@Index()
	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public noteUserHost: string | null;

	@Column('varchar', {
		length: 64,
	})
	public noteVisibility: string;

	@Index()
	@Column('boolean', {
		default: false,
	})
	public isRemote: boolean;

	@Column('varchar', {
		length: 32,
	})
	public provider: string;

	@Column('varchar', {
		length: 128,
	})
	public model: string;

	@Column('varchar', {
		length: 128,
		array: true,
		default: '{}',
	})
	public flaggedCategories: string[];

	@Column('jsonb')
	public categoryScores: Record<string, number>;

	@Column('jsonb', {
		nullable: true,
	})
	public rawResult: Record<string, any> | null;

	@Index()
	@Column('boolean', {
		default: false,
	})
	public resolved: boolean;

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

	@Column('varchar', {
		length: 8192,
		default: '',
	})
	public moderationNote: string;
}
