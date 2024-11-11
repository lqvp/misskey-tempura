/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveFileCacheExpire1729234755418 {
	name = 'DriveFileCacheExpire1729234755418';

	async up(queryRunner) {
		await queryRunner.query(`
            ALTER TABLE "drive_file"
            ADD "cachedAt" TIMESTAMP WITH TIME ZONE
        `);
		await queryRunner.query(`
            COMMENT ON COLUMN "drive_file"."cachedAt" IS 'Cache Timestamp'
        `);
		await queryRunner.query(`
            ALTER TABLE "meta"
            ADD "objectStorageCacheDays" integer
        `);
		await queryRunner.query(`
            CREATE INDEX "IDX-drive-cachedAt-mua" ON "drive_file" ("cachedAt")
        `);
	}

	async down(queryRunner) {
		await queryRunner.query(`
            DROP INDEX "public"."IDX-drive-cachedAt-mua"
        `);
		await queryRunner.query(`
            ALTER TABLE "meta" DROP COLUMN "objectStorageCacheDays"
        `);
		await queryRunner.query(`
            COMMENT ON COLUMN "drive_file"."cachedAt" IS 'Cache Timestamp'
        `);
		await queryRunner.query(`
            ALTER TABLE "drive_file" DROP COLUMN "cachedAt"
        `);
	}
}
