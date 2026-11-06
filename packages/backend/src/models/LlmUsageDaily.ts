/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { PrimaryColumn, Entity, Index, Column } from 'typeorm';
import { id } from './util/id.js';

@Entity('llm_usage_daily')
@Index(['userId', 'date'])
export class MiLlmUsageDaily {
	@PrimaryColumn('date')
	public date: string;

	@PrimaryColumn(id())
	public userId: string;

	@PrimaryColumn('varchar', { length: 32 })
	public purpose: string;

	@PrimaryColumn('text')
	public model: string;

	@Column('bigint', { default: 0 })
	public requests: string;

	@Column('bigint', { default: 0 })
	public successes: string;

	@Column('bigint', { default: 0 })
	public failures: string;

	@Column('bigint', { default: 0 })
	public inputTokens: string;

	@Column('bigint', { default: 0 })
	public inputSamples: string;

	@Column('bigint', { default: 0 })
	public outputTokens: string;

	@Column('bigint', { default: 0 })
	public outputSamples: string;

	@Column('bigint', { default: 0 })
	public thinkingTokens: string;

	@Column('bigint', { default: 0 })
	public thinkingSamples: string;

	@Column('bigint', { default: 0 })
	public cachedTokens: string;

	@Column('bigint', { default: 0 })
	public cachedSamples: string;

	@Column('bigint', { default: 0 })
	public totalTokens: string;

	@Column('bigint', { default: 0 })
	public totalSamples: string;
}
