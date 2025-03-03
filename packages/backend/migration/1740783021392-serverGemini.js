/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class serverGemini1740783021392 {
	constructor() {
			this.name = 'serverGemini1740783021392';
	}

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "serverGeminiEnabled" boolean DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "serverGeminiApiKey" character varying(50)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "serverGeminiModels" character varying(50) DEFAULT 'gemini-2.0-flash'`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "serverGeminiEnabled"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "serverGeminiApiKey"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "serverGeminiModels"`);
	}
}
