/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAntennaOnlyFollowers1751215087655 {
    name = 'AddAntennaOnlyFollowers1751215087655';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" ADD "onlyFollowers" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" DROP COLUMN "onlyFollowers"`);
    }
}

