/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ExpandGeminiColumns1781401914032 {
	name = 'ExpandGeminiColumns1781401914032'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiApiKey" TYPE character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiModels" TYPE character varying(256)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiModels" TYPE character varying(50)`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiApiKey" TYPE character varying(50)`);
	}
}
