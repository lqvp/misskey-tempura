/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AvatarDecorationMuting1754340150847 {
    name = 'AvatarDecorationMuting1754340150847'

    async up(queryRunner) {
        await queryRunner.query(`
            CREATE TABLE "avatar_decoration_muting" (
                "id" character varying(32) NOT NULL,
                "muterId" character varying(32) NOT NULL,
                "muteeId" character varying(32) NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_avatar_decoration_muting_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_avatar_decoration_muting_expiresAt" ON "avatar_decoration_muting" ("expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_avatar_decoration_muting_muteeId" ON "avatar_decoration_muting" ("muteeId")`);
        await queryRunner.query(`CREATE INDEX "IDX_avatar_decoration_muting_muterId" ON "avatar_decoration_muting" ("muterId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_avatar_decoration_muting_muterId_muteeId" ON "avatar_decoration_muting" ("muterId", "muteeId")`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_muting" ADD CONSTRAINT "FK_avatar_decoration_muting_muteeId" FOREIGN KEY ("muteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_muting" ADD CONSTRAINT "FK_avatar_decoration_muting_muterId" FOREIGN KEY ("muterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "avatar_decoration_muting" DROP CONSTRAINT "FK_avatar_decoration_muting_muterId"`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_muting" DROP CONSTRAINT "FK_avatar_decoration_muting_muteeId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_avatar_decoration_muting_muterId_muteeId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_avatar_decoration_muting_muterId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_avatar_decoration_muting_muteeId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_avatar_decoration_muting_expiresAt"`);
        await queryRunner.query(`DROP TABLE "avatar_decoration_muting"`);
    }
}
