/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousFederationAccess1792742457139 {
    name = 'AllowAnonymousFederationAccess1792742457139'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousFederationUsers" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousFederationStats" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousShowInstance" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousFederationUsers"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousFederationStats"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousShowInstance"`);
    }
}
