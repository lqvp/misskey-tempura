/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMetaMediaProxy1795455120000 {
	name = 'AddMetaMediaProxy1795455120000';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "meta" ADD "mediaProxy" character varying(1024)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "mediaProxy"');
	}
}
