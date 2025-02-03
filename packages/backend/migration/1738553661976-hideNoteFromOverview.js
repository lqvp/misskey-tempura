/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class hideNoteFromOverview1738553661976 {
	name = 'hideNoteFromOverview1738553661976'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "hideNoteFromOverview" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "hideNoteFromOverview"`);
	}
}
