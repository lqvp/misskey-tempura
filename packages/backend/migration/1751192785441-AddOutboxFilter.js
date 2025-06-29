/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddOutboxFilter1751192785441 {
	name = 'AddOutboxFilter1751192785441'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "outboxFilter" jsonb NOT NULL DEFAULT '{"public": true, "public_non_ltl": true, "home": true}'`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "outboxFilter"`);
	}
}
