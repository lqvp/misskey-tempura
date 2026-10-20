/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RequireSignedApFetch1792459416497 {
    name = 'RequireSignedApFetch1792459416497'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "requireSignedApFetch" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "requireSignedApFetch"`);
    }
}
