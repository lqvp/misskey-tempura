/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class friendlyCaptcha1730505338000 {
	name = 'friendlyCaptcha1730505338000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableFC" boolean NOT NULL DEFAULT false`, undefined);
		await queryRunner.query(`ALTER TABLE "meta" ADD "fcSiteKey" character varying(1024)`, undefined);
		await queryRunner.query(`ALTER TABLE "meta" ADD "fcSecretKey" character varying(1024)`, undefined);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "fcSecretKey"`, undefined);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "fcSiteKey"`, undefined);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableFC"`, undefined);
	}
}
