/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteEmojiAlias1793286631902 {
    name = 'NoteEmojiAlias1793286631902'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "note_emoji_alias" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE, "alias" character varying(128) NOT NULL, "name" character varying(128) NOT NULL, "host" character varying(128) NOT NULL, "uri" character varying(512), "originalUrl" character varying(512) NOT NULL, "publicUrl" character varying(512) NOT NULL DEFAULT '', "type" character varying(64), "isSensitive" boolean NOT NULL DEFAULT false, "license" character varying(1024), CONSTRAINT "PK_2ef458b544b82fb2403b9a1a71f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_70f0759704cfa8ccb091564470" ON "note_emoji_alias"  ("alias") `);
        await queryRunner.query(`CREATE INDEX "IDX_28c84b0dbd51d596fd127c1813" ON "note_emoji_alias"  ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_3514e8cda6a36712c311ea3e87" ON "note_emoji_alias"  ("host") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8a065c87440e354efd5d7ee422" ON "note_emoji_alias"  ("name", "host") `);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_8a065c87440e354efd5d7ee422"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3514e8cda6a36712c311ea3e87"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_28c84b0dbd51d596fd127c1813"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_70f0759704cfa8ccb091564470"`);
        await queryRunner.query(`DROP TABLE "note_emoji_alias"`);
    }
}
