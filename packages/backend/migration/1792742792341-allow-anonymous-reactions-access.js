/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousReactionsAccess1792742792341 {
    name = 'AllowAnonymousReactionsAccess1792742792341'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousReplies" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousRenotes" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousQuotes" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousReplies"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousRenotes"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousQuotes"`);
    }
}
