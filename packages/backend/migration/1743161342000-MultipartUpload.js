/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MultipartUpload1743161342000 {
    name = 'MultipartUpload1743161342000'

    async up(queryRunner) {
        await queryRunner.query(`
            CREATE TABLE "multipart_upload" (
                "id" character varying(32) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "userId" character varying(32) NOT NULL,
                "name" character varying(256) NOT NULL,
                "folderId" character varying(32),
                "comment" character varying(2048),
                "isSensitive" boolean NOT NULL DEFAULT false,
                "force" boolean NOT NULL DEFAULT false,
                "totalSize" bigint NOT NULL,
                "totalParts" integer NOT NULL,
                "completedParts" integer NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_multipart_upload_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_multipart_upload_userId" ON "multipart_upload" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_multipart_upload_expiresAt" ON "multipart_upload" ("expiresAt") `);

        await queryRunner.query(`
            ALTER TABLE "multipart_upload"
            ADD CONSTRAINT "FK_multipart_upload_userId_user_id"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "multipart_upload"
            ADD CONSTRAINT "FK_multipart_upload_folderId_drive_folder_id"
            FOREIGN KEY ("folderId") REFERENCES "drive_folder"("id")
            ON DELETE SET NULL
        `);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "multipart_upload" DROP CONSTRAINT "FK_multipart_upload_folderId_drive_folder_id"`);
        await queryRunner.query(`ALTER TABLE "multipart_upload" DROP CONSTRAINT "FK_multipart_upload_userId_user_id"`);
        await queryRunner.query(`DROP INDEX "IDX_multipart_upload_expiresAt"`);
        await queryRunner.query(`DROP INDEX "IDX_multipart_upload_userId"`);
        await queryRunner.query(`DROP TABLE "multipart_upload"`);
    }
}
