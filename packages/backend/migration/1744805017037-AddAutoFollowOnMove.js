/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAutoFollowOnMove1744805017037 {
	name = 'AddAutoFollowOnMove1744805017037';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "user_profile" ADD "autoFollowOnMove" boolean NOT NULL DEFAULT true');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "autoFollowOnMove"');
	}
}
