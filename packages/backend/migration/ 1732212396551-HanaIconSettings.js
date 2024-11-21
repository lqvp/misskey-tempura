/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */


export class HanaIconSettings1732212396551 {
	name = 'HanaIconSettings1732212396551'
	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaModeIcon" character varying(1024)`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaModeIconSize" integer NOT NULL DEFAULT 128`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaModeIconRadius" integer NOT NULL DEFAULT 50`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaModeBackground" character varying(1024)`);
	}
	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaModeBackground"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaModeIconRadius"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaModeIconSize"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaModeIcon"`);
	}
}
