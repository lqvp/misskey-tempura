/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddTimedRenoteQuoteMutes1754350113727 {
    name = 'AddTimedRenoteQuoteMutes1754350113727'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "renote_muting" ADD "expiresAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_renote_muting_expiresAt" ON "renote_muting" ("expiresAt")`);
        await queryRunner.query(`ALTER TABLE "quote_muting" ADD "expiresAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_quote_muting_expiresAt" ON "quote_muting" ("expiresAt")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_quote_muting_expiresAt"`);
        await queryRunner.query(`ALTER TABLE "quote_muting" DROP COLUMN "expiresAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_renote_muting_expiresAt"`);
        await queryRunner.query(`ALTER TABLE "renote_muting" DROP COLUMN "expiresAt"`);
    }
}
