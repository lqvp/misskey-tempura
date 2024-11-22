/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class backgroundImageUrls1732305608643 {
	name = 'backgroundImageUrls1732305608643'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "backgroundImageUrls" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "backgroundImageUrls"`);
	}
}
