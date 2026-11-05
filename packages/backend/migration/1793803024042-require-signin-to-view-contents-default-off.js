/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RequireSigninToViewContentsDefaultOff1793803024042 {
    name = 'RequireSigninToViewContentsDefaultOff1793803024042'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "requireSigninToViewContents" SET DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "requireSigninToViewContents" SET DEFAULT true`);
    }
}
