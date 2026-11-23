/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class SignupPassphraseAndFixedInviteCode1795059576438 {
    name = 'SignupPassphraseAndFixedInviteCode1795059576438'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "fixedInviteCode" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "signupPassphrase" character varying(256)`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "signupPassphrase"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "fixedInviteCode"`);
    }
}
