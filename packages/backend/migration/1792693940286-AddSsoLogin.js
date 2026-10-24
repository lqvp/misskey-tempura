/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSsoLogin1792693940286 {
    name = 'AddSsoLogin1792693940286'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "ssoProviders" jsonb NOT NULL DEFAULT '[]'::jsonb`);
        await queryRunner.query(`CREATE TABLE "user_sso_link" ("id" varchar(32) PRIMARY KEY NOT NULL, "userId" varchar(32) NOT NULL, "provider" varchar(128) NOT NULL, "providerUserId" varchar(1024) NOT NULL, "createdAt" timestamp with time zone NOT NULL)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_user_sso_link_provider_providerUserId" ON "user_sso_link" ("provider", "providerUserId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_user_sso_link_userId_provider" ON "user_sso_link" ("userId", "provider")`);
        await queryRunner.query(`ALTER TABLE "user_sso_link" ADD CONSTRAINT "FK_user_sso_link_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_sso_link" DROP CONSTRAINT "FK_user_sso_link_userId"`);
        await queryRunner.query(`DROP TABLE "user_sso_link"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "ssoProviders"`);
    }
}
