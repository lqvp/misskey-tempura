/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousReactions1795058369659 {
    name = 'AllowAnonymousReactions1795058369659'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousReactions" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousReactions"`);
    }
}
