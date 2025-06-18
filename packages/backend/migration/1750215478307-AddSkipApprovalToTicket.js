/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSkipApprovalToTicket1750215478307 {
		name = 'AddSkipApprovalToTicket1750215478307'

		async up(queryRunner) {
				await queryRunner.query(`ALTER TABLE "registration_ticket" ADD COLUMN "skipApproval" BOOLEAN DEFAULT false`);
		}

		async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "registration_ticket" DROP COLUMN "skipApproval"`);
		}
}
