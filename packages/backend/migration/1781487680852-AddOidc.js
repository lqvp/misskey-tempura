/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddOidc1781487680852 {
    name = 'AddOidc1781487680852'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcIssuerUrl" varchar(1024) DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcClientId" varchar(1024) DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcClientSecret" varchar(1024) DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcButtonLabel" varchar(128) DEFAULT NULL`);
        await queryRunner.query(`CREATE TABLE "user_oidc_link" ("id" varchar(32) PRIMARY KEY NOT NULL, "userId" varchar(32) NOT NULL, "provider" varchar(128) NOT NULL, "issuer" varchar(1024) NOT NULL, "providerUserId" varchar(1024) NOT NULL, "createdAt" timestamp with time zone NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_user_oidc_link_userId" ON "user_oidc_link" ("userId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_oidc_link_issuer_providerUserId" ON "user_oidc_link" ("issuer", "providerUserId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_oidc_link_userId_issuer" ON "user_oidc_link" ("userId", "issuer")`);
        await queryRunner.query(`ALTER TABLE "user_oidc_link" ADD CONSTRAINT "FK_user_oidc_link_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_oidc_link" DROP CONSTRAINT "FK_user_oidc_link_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_oidc_link_userId_issuer"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_oidc_link_issuer_providerUserId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_oidc_link_userId"`);
        await queryRunner.query(`DROP TABLE "user_oidc_link"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcButtonLabel"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcClientSecret"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcClientId"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcIssuerUrl"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcEnabled"`);
    }
}
