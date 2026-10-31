/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class LlmUsage1793098554731 {
    name = 'LlmUsage1793098554731'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "llm_usage_daily" ("date" date NOT NULL, "userId" character varying(32) NOT NULL, "purpose" character varying(32) NOT NULL, "model" text NOT NULL, "requests" bigint NOT NULL DEFAULT '0', "successes" bigint NOT NULL DEFAULT '0', "failures" bigint NOT NULL DEFAULT '0', "inputTokens" bigint NOT NULL DEFAULT '0', "inputSamples" bigint NOT NULL DEFAULT '0', "outputTokens" bigint NOT NULL DEFAULT '0', "outputSamples" bigint NOT NULL DEFAULT '0', "thinkingTokens" bigint NOT NULL DEFAULT '0', "thinkingSamples" bigint NOT NULL DEFAULT '0', "cachedTokens" bigint NOT NULL DEFAULT '0', "cachedSamples" bigint NOT NULL DEFAULT '0', "totalTokens" bigint NOT NULL DEFAULT '0', "totalSamples" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_c6493f54bc7bf5628757ced2e9d" PRIMARY KEY ("date", "userId", "purpose", "model"))`);
        await queryRunner.query(`CREATE INDEX "IDX_08544a67188e7102212e09b5cf" ON "llm_usage_daily"  ("userId", "date") `);
        await queryRunner.query(`CREATE TABLE "llm_usage_daily_total" ("date" date NOT NULL, "purpose" character varying(32) NOT NULL, "model" text NOT NULL, "requests" bigint NOT NULL DEFAULT '0', "successes" bigint NOT NULL DEFAULT '0', "failures" bigint NOT NULL DEFAULT '0', "inputTokens" bigint NOT NULL DEFAULT '0', "inputSamples" bigint NOT NULL DEFAULT '0', "outputTokens" bigint NOT NULL DEFAULT '0', "outputSamples" bigint NOT NULL DEFAULT '0', "thinkingTokens" bigint NOT NULL DEFAULT '0', "thinkingSamples" bigint NOT NULL DEFAULT '0', "cachedTokens" bigint NOT NULL DEFAULT '0', "cachedSamples" bigint NOT NULL DEFAULT '0', "totalTokens" bigint NOT NULL DEFAULT '0', "totalSamples" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_86e158e0c318cae2b95cf75935e" PRIMARY KEY ("date", "purpose", "model"))`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "llmUsageRetentionMonths" integer NOT NULL DEFAULT '12'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "llmUsageStartedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "llmUsageStartedAt"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "llmUsageRetentionMonths"`);
        await queryRunner.query(`DROP TABLE "llm_usage_daily_total"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_08544a67188e7102212e09b5cf"`);
        await queryRunner.query(`DROP TABLE "llm_usage_daily"`);
    }
}
