/*
 * SPDX-FileCopyrightText: chan-mai
 * SPDX-License-Identifier: AGPL-3.0-only
*/

export class addAntennaMustExcludeKeywords1767545909806 {
    name = 'addAntennaMustExcludeKeywords1767545909806'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" ADD "mustExcludeKeywords" jsonb NOT NULL DEFAULT '[]'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" DROP COLUMN "mustExcludeKeywords"`);
    }
}
