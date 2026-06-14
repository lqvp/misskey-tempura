/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AlignContactFormCategoryLength1781401914033 {
	name = 'AlignContactFormCategoryLength1781401914033'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "contact_form" ALTER COLUMN "category" TYPE character varying(64)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "contact_form" ALTER COLUMN "category" TYPE character varying(32)`);
	}
}
