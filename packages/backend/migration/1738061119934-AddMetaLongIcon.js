/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMetaLongIcon1738061119934 {
	name = 'AddMetaLongIcon1738061119934'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableLongIconUrl" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "longIconUrl" character varying(1024)`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "longIconUrl"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableLongIconUrl"`);
	}
}
