/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddValidateMinimumUsernameLength1731136911730 {
	name = 'AddValidateMinimumUsernameLength1731136911730'

	async up(queryRunner) {
			await queryRunner.query(`
					alter table meta
							add "validateMinimumUsernameLength" integer default 5 not null;
			`);
	}

	async down(queryRunner) {
			await queryRunner.query(`
					alter table meta
							drop column "validateMinimumUsernameLength";
			`);
	}
}
