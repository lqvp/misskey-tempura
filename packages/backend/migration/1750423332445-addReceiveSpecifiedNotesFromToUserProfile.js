/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class addReceiveSpecifiedNotesFromToUserProfile1750423332445 {
	name = 'addReceiveSpecifiedNotesFromToUserProfile1750423332445';

	async up(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "user_profile" ADD COLUMN "receiveSpecifiedNotesFrom" VARCHAR(15) NOT NULL DEFAULT 'all'`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_profile" ADD CONSTRAINT "chk_user_profile_receiveSpecifiedNotesFrom_values" CHECK ("receiveSpecifiedNotesFrom" IN ('all', 'following', 'nobody'))`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "user_profile" DROP CONSTRAINT "chk_user_profile_receiveSpecifiedNotesFrom_values"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_profile" DROP COLUMN "receiveSpecifiedNotesFrom"`,
		);
	}
}
