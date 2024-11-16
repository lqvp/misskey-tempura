/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FeatAutoRejectFollowRequest1697683129062 {
    name = 'FeatAutoRejectFollowRequest1697683129062'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "autoRejectFollowRequest" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "autoRejectFollowRequest"`);
    }
}
