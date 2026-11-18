/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DefaultRequireSigninToViewContents1795004297533 {
    name = 'DefaultRequireSigninToViewContents1795004297533'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "defaultRequireSigninToViewContents" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "defaultRequireSigninToViewContents"`);
    }
}
