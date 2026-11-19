/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * OpenAI 互換 API 設定に移行したため、サーバー Gemini 設定カラムを削除する。
 *
 * @class
 * @implements {MigrationInterface}
 */
export class RemoveServerGeminiSettings1795074709757 {
    name = 'RemoveServerGeminiSettings1795074709757'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN IF EXISTS "serverGeminiModels"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN IF EXISTS "serverGeminiApiKey"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN IF EXISTS "serverGeminiEnabled"');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" ADD "serverGeminiEnabled" boolean NOT NULL DEFAULT false');
        await queryRunner.query('ALTER TABLE "meta" ADD "serverGeminiApiKey" character varying(50)');
        await queryRunner.query('ALTER TABLE "meta" ADD "serverGeminiModels" character varying(50) DEFAULT \'gemini-2.0-flash\'');
    }
}
