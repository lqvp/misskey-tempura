/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixAnnouncementRolePrimaryKey1773000000000 {
	name = 'FixAnnouncementRolePrimaryKey1773000000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "announcement_role" DROP CONSTRAINT "PK_cb76dfa429c742b1a273ef18d71983ea"`);
		await queryRunner.query(`ALTER TABLE "announcement_role" ADD CONSTRAINT "PK_announcement_role_id" PRIMARY KEY ("id")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "announcement_role" DROP CONSTRAINT "PK_announcement_role_id"`);
		await queryRunner.query(`ALTER TABLE "announcement_role" ADD CONSTRAINT "PK_cb76dfa429c742b1a273ef18d71983ea" PRIMARY KEY ("announcementId", "roleId")`);
	}
}
