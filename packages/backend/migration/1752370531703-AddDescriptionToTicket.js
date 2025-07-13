/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddDescriptionToTicket1752370531703 {
	name = 'AddDescriptionToTicket1752370531703'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "registration_ticket" ADD "description" varchar(256)`);
	}
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "registration_ticket" DROP COLUMN "description"`);
	}
}
