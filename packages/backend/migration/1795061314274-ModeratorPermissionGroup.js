/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class ModeratorPermissionGroup1795061314274 {
    name = 'ModeratorPermissionGroup1795061314274'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TYPE "public"."role_permissiongroup_enum" ADD VALUE 'Moderator'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        // PostgreSQL は enum から値を削除できないため、旧 4 値の enum 型を作り直して付け替える。
        // 先に 'Moderator' ロールを 'MainModerator' へ集約しないと型変換に失敗する点に注意。
        await queryRunner.query(`UPDATE "role" SET "permissionGroup" = 'MainModerator' WHERE "permissionGroup" = 'Moderator'`);
        await queryRunner.query(`CREATE TYPE "public"."role_permissiongroup_enum_old" AS ENUM('Admin', 'MainModerator', 'Normal', 'Community')`);
        await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "permissionGroup" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "permissionGroup" TYPE "public"."role_permissiongroup_enum_old" USING "permissionGroup"::"text"::"public"."role_permissiongroup_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."role_permissiongroup_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."role_permissiongroup_enum_old" RENAME TO "role_permissiongroup_enum"`);
        await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "permissionGroup" SET DEFAULT 'Normal'`);
    }
}
