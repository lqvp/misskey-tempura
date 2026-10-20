/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LoginRiskShowDetailsToUser1792414649293 {
    name = 'LoginRiskShowDetailsToUser1792414649293'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginRiskShowDetailsToUser" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginRiskShowDetailsToUser"`);
    }
}
