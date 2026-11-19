/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SignupPassphraseAndFixedInviteCode1795120000000 {
	name = 'SignupPassphraseAndFixedInviteCode1795120000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "fixedInviteCode" varchar(128) DEFAULT NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "signupPassphrase" varchar(256) DEFAULT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "signupPassphrase"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "fixedInviteCode"`);
	}
}
