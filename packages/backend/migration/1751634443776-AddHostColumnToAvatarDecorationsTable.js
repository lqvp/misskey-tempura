/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddHostColumnToAvatarDecorationsTable1751634443776 {
		name = 'AddHostColumnToAvatarDecorationsTable1751634443776';

		async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "avatar_decoration" ADD "host" character varying(256) DEFAULT null`);
		}

		async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "avatar_decoration" DROP COLUMN "host"`);
		}
}

