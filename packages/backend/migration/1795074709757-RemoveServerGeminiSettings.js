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
        // Gemini 運用サーバー向けに、既存の Gemini 設定を OpenAI 互換設定へ引き継ぐ。
        // Gemini は OpenAI 互換エンドポイント (https://generativelanguage.googleapis.com/v1beta/openai/)
        // を持つため、API キーはそのまま再利用できる。
        await queryRunner.query(`UPDATE "meta" SET
            "serverOpenAIApiKey" = "serverGeminiApiKey",
            "serverOpenAIEnabled" = "serverGeminiEnabled",
            "serverOpenAIBaseURL" = 'https://generativelanguage.googleapis.com/v1beta/openai',
            "serverOpenAIModels" = COALESCE("serverGeminiModels", 'gemini-2.0-flash')
            WHERE "serverGeminiApiKey" IS NOT NULL`);
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
        // OpenAI 側の設定を Gemini カラムへ書き戻す。
        // ただし Gemini カラムは varchar(50) のため、長さが収まる値のみ復元する
        // (収まらない場合は既定値のまま＝無効状態でロールバックし、ロールバック自体の失敗を防ぐ)
        await queryRunner.query('UPDATE "meta" SET "serverGeminiEnabled" = "serverOpenAIEnabled", "serverGeminiApiKey" = "serverOpenAIApiKey", "serverGeminiModels" = "serverOpenAIModels" WHERE "serverOpenAIApiKey" IS NOT NULL AND LENGTH("serverOpenAIApiKey") <= 50 AND LENGTH("serverOpenAIModels") <= 50');
    }
}
