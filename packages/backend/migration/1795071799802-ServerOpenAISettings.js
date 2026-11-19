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
export class ServerOpenAISettings1795071799802 {
    name = 'ServerOpenAISettings1795071799802'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" ADD "serverOpenAIEnabled" boolean NOT NULL DEFAULT false');
        await queryRunner.query('ALTER TABLE "meta" ADD "serverOpenAIApiKey" character varying(1024)');
        await queryRunner.query('ALTER TABLE "meta" ADD "serverOpenAIBaseURL" character varying(512)');
        await queryRunner.query('ALTER TABLE "meta" ADD "serverOpenAIModels" character varying(512) NOT NULL DEFAULT \'gpt-4o-mini\'');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "serverOpenAIModels"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "serverOpenAIBaseURL"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "serverOpenAIApiKey"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "serverOpenAIEnabled"');
    }
}
