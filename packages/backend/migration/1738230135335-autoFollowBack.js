/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class autoFollowBack1738230135335 {
	name = 'autoFollowBack1738230135335'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" ADD "autoFollowBack" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "autoFollowBack"`);
	}
}
