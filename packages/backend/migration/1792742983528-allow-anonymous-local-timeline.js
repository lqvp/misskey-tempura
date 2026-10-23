/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousLocalTimeline1792742983528 {
    name = 'AllowAnonymousLocalTimeline1792742983528'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousLocalTimeline" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousLocalTimeline"`);
    }
}
