/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class rainbowRole1740515185500 {
	name = 'rainbowRole1740515185500'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "role" ADD "isRainbow" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "isRainbow"`);
	}

}
