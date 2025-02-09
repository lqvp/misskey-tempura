/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class hideLocalOnlyNotes1739069547711 {
	name = 'hideLocalOnlyNotes1739069547711'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "hideLocalOnlyNotes" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "hideLocalOnlyNotes"`);
	}
}
