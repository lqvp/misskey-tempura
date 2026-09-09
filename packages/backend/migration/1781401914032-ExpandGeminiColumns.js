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
		// Check for data that would be truncated
		const tooLongModels = await queryRunner.query(
			`SELECT COUNT(*) as count FROM "meta" WHERE LENGTH("serverGeminiModels") > 50`
		);
		const tooLongApiKey = await queryRunner.query(
			`SELECT COUNT(*) as count FROM "meta" WHERE LENGTH("serverGeminiApiKey") > 50`
		);

		if (parseInt(tooLongModels[0].count) > 0) {
			throw new Error('Cannot revert migration: serverGeminiModels contains data exceeding 50 characters');
		}
		if (parseInt(tooLongApiKey[0].count) > 0) {
			throw new Error('Cannot revert migration: serverGeminiApiKey contains data exceeding 50 characters');
		}

		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiModels" TYPE character varying(50)`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverGeminiApiKey" TYPE character varying(50)`);
	}
}
