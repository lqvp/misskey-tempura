/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('contact_form')
export class MiContactForm {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public updatedAt: Date | null;

	// 必須項目
	@Column('varchar', { length: 256 })
	public subject: string; // 件名（必須）

	@Column('text')
	public content: string; // お問い合わせ内容（必須）

	// 返信方法（必須：emailまたはmisskey）
	@Index()
	@Column('enum', {
		enum: ['email', 'misskey']
	})
	public replyMethod: 'email' | 'misskey';

	// 推奨項目（任意）
	@Column('varchar', { length: 256, nullable: true })
	public name: string | null; // 名前・ニックネーム（任意）

	@Column('varchar', { length: 512, nullable: true })
	public email: string | null; // メールアドレス（replyMethod=emailの場合必須）

	@Column('varchar', { length: 128, nullable: true })
	public misskeyUsername: string | null; // Misskeyユーザー名（replyMethod=misskeyの場合必須）

	// カテゴリ
	@Index()
	@Column('enum', {
		enum: ['bug_report', 'feature_request', 'account_issue', 'technical_issue', 'content_issue', 'other'],
		default: 'other'
	})
	public category: 'bug_report' | 'feature_request' | 'account_issue' | 'technical_issue' | 'content_issue' | 'other';

	// 管理用
	@Index()
	@Column('enum', {
		enum: ['pending', 'in_progress', 'resolved', 'closed'],
		default: 'pending'
	})
	public status: 'pending' | 'in_progress' | 'resolved' | 'closed';

	@Column('text', { nullable: true })
	public adminNote: string | null;

	@Column('varchar', { length: 45, nullable: true })
	public ipAddress: string | null;

	@Column('varchar', { length: 512, nullable: true })
	public userAgent: string | null;

	// 送信者がログインユーザーの場合（自動取得）
	@Index()
	@Column(id(), { nullable: true })
	public userId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn()
	public user: MiUser | null;

	// 担当者
	@Index()
	@Column(id(), { nullable: true })
	public assignedUserId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn()
	public assignedUser: MiUser | null;
}
