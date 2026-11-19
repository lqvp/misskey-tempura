/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ModeratorPermissionGroup1795090000000 {
	name = 'ModeratorPermissionGroup1795090000000'

	async up(queryRunner) {
		// role テーブルの permissionGroup enum に 'Moderator' (サブモデレーター階級) を追加
		// 既存のマイグレーション (1695479010509) で作られた enum 型は 4 値のみのため、
		// エンティティ定義と揃えるために値を追加する
		// NOTE: ADD VALUE はトランザクション内で実行した場合、同一トランザクション内で
		// 新しい値を参照できない (PG 12+)。このマイグレーションでは値の追加のみを行う
		await queryRunner.query(`ALTER TYPE "public"."role_permissiongroup_enum" ADD VALUE IF NOT EXISTS 'Moderator'`);
	}

	async down(queryRunner) {
		// PostgreSQL は enum から値を削除できないため、旧 4 値の enum 型を作り直して付け替える
		// 'Moderator' のロールは 'MainModerator' へ集約する
		await queryRunner.query(`UPDATE "role" SET "permissionGroup" = 'MainModerator' WHERE "permissionGroup" = 'Moderator'`);
		await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "permissionGroup" TYPE varchar(32) USING ("permissionGroup"::text)`);
		await queryRunner.query(`DROP TYPE "public"."role_permissiongroup_enum"`);
		await queryRunner.query(`CREATE TYPE "public"."role_permissiongroup_enum" AS ENUM('Admin', 'MainModerator', 'Normal', 'Community')`);
		await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "permissionGroup" TYPE "public"."role_permissiongroup_enum" USING ("permissionGroup"::text)::"public"."role_permissiongroup_enum"`);
	}
}
