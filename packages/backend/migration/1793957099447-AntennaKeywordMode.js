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

    // 注意: down() は keywordMode 列を削除するため、各アンテナの「通常/正規表現」の選択が失われる。
    // ロールバックが必要な場合は、コードだけを戻してこの列を残すこと (旧コードはこの列を参照しないので共存できる)。
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "antenna" DROP COLUMN "keywordMode"`);
        await queryRunner.query(`DROP TYPE "public"."antenna_keywordmode_enum"`);
    }
}
