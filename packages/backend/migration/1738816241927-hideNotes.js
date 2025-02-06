/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class hideNotes1738816241927 {
	name = 'hideNotes1738816241927'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "hidePublicNotes" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "hideHomeNotes" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "hidePublicNotes"`);
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "hideHomeNotes"`);
	}
}
