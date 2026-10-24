/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('user_sso_link')
@Index('UQ_user_sso_link_provider_providerUserId', ['provider', 'providerUserId'], { unique: true })
@Index('UQ_user_sso_link_userId_provider', ['userId', 'provider'], { unique: true })
export class MiUserSsoLink {
	@PrimaryColumn(id())
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	// meta.ssoProviders の key。同じ key の設定が同じ IdP を指し続ける前提で安定識別子として使う
	@Column('varchar', {
		length: 128,
	})
	public provider: string;

	// IdP側の安定識別子 (OIDC: sub / GitHub: user.id / Discord: user.id)
	@Column('varchar', {
		length: 1024,
	})
	public providerUserId: string;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
