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
		// Check for data that would be truncated
		const tooLongCategory = await queryRunner.query(
			`SELECT COUNT(*) as count FROM "contact_form" WHERE LENGTH("category") > 32`
		);

		if (parseInt(tooLongCategory[0].count) > 0) {
			throw new Error('Cannot revert migration: contact_form.category contains data exceeding 32 characters');
		}

		await queryRunner.query(`ALTER TABLE "contact_form" ALTER COLUMN "category" TYPE character varying(32)`);
	}
}
