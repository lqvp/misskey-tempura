/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddFollowInviter1755742598493 {
		name = 'AddFollowInviter1755742598493'

		async up(queryRunner) {
				await queryRunner.query(`ALTER TABLE "registration_ticket" ADD COLUMN "followInviter" BOOLEAN DEFAULT false`);
		}

		async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "registration_ticket" DROP COLUMN "followInviter"`);
		}
}
