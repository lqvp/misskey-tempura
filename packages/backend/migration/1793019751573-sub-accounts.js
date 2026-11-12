/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SubAccounts1793019751573 {
    name = 'SubAccounts1793019751573'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "suspendedSelf" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."suspendedSelf" IS 'Whether the User suspended itself (effective isSuspended is suspendedSelf OR suspendedByParent).'`);
        await queryRunner.query(`UPDATE "user" SET "suspendedSelf" = true WHERE "isSuspended" = true`);
        await queryRunner.query(`ALTER TABLE "user" ADD "suspendedByParent" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."suspendedByParent" IS 'Whether the sub-account is suspended by its parent account.'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "parentUserId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."parentUserId" IS 'The parent (main) account of this sub-account. Null for ordinary accounts.'`);
        await queryRunner.query(`CREATE INDEX "IDX_875b4896d9516ba6225ff27bd2" ON "user" ("parentUserId")`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "FK_875b4896d9516ba6225ff27bd20" FOREIGN KEY ("parentUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user" ADD "initialSettingsOpenUntil" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."initialSettingsOpenUntil" IS 'Until when the main account may save the one-time initial settings of this sub-account. Null once used, expired or never opened.'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "showParentOnProfile" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."showParentOnProfile" IS 'Whether the profile of this sub-account shows its parent account.'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "showSubOnProfile" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."showSubOnProfile" IS 'Whether the profile of the parent account lists this sub-account.'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "subAccountCreationMode" character varying(32) NOT NULL DEFAULT 'followRegistration'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "subAccountCreationMode"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "showSubOnProfile"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "initialSettingsOpenUntil"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "showParentOnProfile"`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "FK_875b4896d9516ba6225ff27bd20"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_875b4896d9516ba6225ff27bd2"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "parentUserId"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "suspendedByParent"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "suspendedSelf"`);
    }
}
