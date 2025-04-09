/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class customCursor1742107847174 {
	name = 'customCursor1742107847174'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "customCursorUrl" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "customCursorPointerUrl" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "customCursorTextUrl" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "customCursorProgressUrl" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "customCursorWaitUrl" character varying(1024)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCursorUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCursorPointerUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCursorTextUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCursorProgressUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "customCursorWaitUrl"`);
	}
}
