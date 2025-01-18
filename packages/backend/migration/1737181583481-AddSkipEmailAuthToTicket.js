/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSkipEmailAuthToTicket1737181583481 {
    name = 'AddSkipEmailAuthToTicket1737181583481'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "registration_ticket" ADD COLUMN "skipEmailAuth" BOOLEAN DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "registration_ticket" DROP COLUMN "skipEmailAuth"`);
    }
}
