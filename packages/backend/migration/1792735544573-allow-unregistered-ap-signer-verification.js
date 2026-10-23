/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowUnregisteredApSignerVerification1792735544573 {
    name = 'AllowUnregisteredApSignerVerification1792735544573'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowUnregisteredApSignerVerification" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowUnregisteredApSignerVerification"`);
    }
}
