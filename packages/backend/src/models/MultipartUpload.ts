/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFolder } from './DriveFolder.js';

@Entity('multipart_upload')
export class MiMultipartUpload {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The owner ID.',
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The folder ID.',
	})
	public folderId: MiDriveFolder['id'] | null;

	@ManyToOne(type => MiDriveFolder, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public folder: MiDriveFolder | null;

	@Column('varchar', {
		length: 256, nullable: true,
		comment: 'The file name.',
	})
	public name: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
		comment: 'The comment of the file.',
	})
	public comment: string | null;

	@Column('boolean', {
		default: false,
		comment: 'Whether the file is sensitive.',
	})
	public isSensitive: boolean;

	@Column('boolean', {
		default: false,
		comment: 'Force upload even if a file with the same hash exists.',
	})
	public force: boolean;

	@Column('integer', {
		comment: 'The total size of the file in bytes.',
	})
	public totalSize: number;

	@Column('integer', {
		comment: 'The total number of parts in this multipart upload.',
	})
	public totalParts: number;

	@Column('integer', {
		default: 0,
		comment: 'The number of parts that have been successfully uploaded.',
	})
	public completedParts: number;

	@Column('timestamp with time zone', {
		comment: 'The expiration time of this multipart upload.',
	})
	public expiresAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The creation time of this multipart upload.',
	})
	public createdAt: Date;
}
