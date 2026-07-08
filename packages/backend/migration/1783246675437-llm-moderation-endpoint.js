/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LlmModerationEndpoint1783246675437 {
	name = 'LlmModerationEndpoint1783246675437'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationApiUrl" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationModel" character varying(256)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationModel"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationApiUrl"`);
	}
}
