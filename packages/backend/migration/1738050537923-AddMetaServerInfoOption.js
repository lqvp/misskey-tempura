/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMetaServerInfoOption1738050537923 {
	name = 'AddMetaServerInfoOption1738050537923'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "enableCpuModel" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "customCpuModel" character varying(1024)`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "enableCpuCore" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "customCpuCore" integer`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "enableMemTotal" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "customMemTotal" integer`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "enableFsTotal" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "customFsTotal" integer`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customFsTotal"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableFsTotal"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customMemTotal"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableMemTotal"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCpuCore"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableCpuCore"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCpuModel"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableCpuModel"`);
	}
}
