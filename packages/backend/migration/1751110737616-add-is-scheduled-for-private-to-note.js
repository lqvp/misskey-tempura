/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddIsScheduledForPrivateToNote1751110737616 {
    name = 'AddIsScheduledForPrivateToNote1751110737616';

    async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "note" ADD "isScheduledForPrivate" boolean DEFAULT false`);
    }

    async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "isScheduledForPrivate"`);
    }
}
