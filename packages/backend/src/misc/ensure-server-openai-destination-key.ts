/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { MiMeta } from '@/models/Meta.js';
import type { EntityManager } from 'typeorm';

/**
 * サーバー提供 LLM の接続先 ID 用の鍵が未生成なら生成する
 * (複数プロセスが同時に生成しても、最初に保存された鍵だけを使う)
 */
export async function ensureServerOpenAIDestinationKey(transactionalEntityManager: EntityManager, meta: MiMeta): Promise<MiMeta> {
	if (meta.serverOpenAIDestinationKey != null) return meta;
	await transactionalEntityManager.createQueryBuilder()
		.update(MiMeta)
		.set({ serverOpenAIDestinationKey: randomBytes(32).toString('hex') })
		.where('id = :id', { id: meta.id })
		.andWhere('"serverOpenAIDestinationKey" IS NULL')
		.execute();
	return await transactionalEntityManager.findOneByOrFail(MiMeta, { id: meta.id });
}
