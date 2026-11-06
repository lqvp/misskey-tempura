/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AntennaKeywordMode1793957099447 {
    name = 'AntennaKeywordMode1793957099447'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE "public"."antenna_keywordmode_enum" AS ENUM('literal', 'regex')`);
        await queryRunner.query(`ALTER TABLE "antenna" ADD "keywordMode" "public"."antenna_keywordmode_enum" NOT NULL DEFAULT 'literal'`);
        await queryRunner.query(`COMMENT ON COLUMN "antenna"."keywordMode" IS 'How keywords are interpreted. literal: plain substring match (default, backward compatible). regex: each item is evaluated as one whole regular expression (RE2 syntax).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" DROP COLUMN "keywordMode"`);
        await queryRunner.query(`DROP TYPE "public"."antenna_keywordmode_enum"`);
    }
}
