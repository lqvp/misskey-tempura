/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LoginRiskDetection1792402198361 {
    name = 'LoginRiskDetection1792402198361'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "user_login_context" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "kind" character varying(16) NOT NULL, "value" character varying(128) NOT NULL, "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "hits" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_b5bdb269ce5c2117eb03deeaf11" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6a9ebce45b963d3c864f2f7139" ON "user_login_context" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e78288795f80ce02e5b62d5813" ON "user_login_context" ("lastSeenAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a0a25fd51bd6bdd6e4f5633ca9" ON "user_login_context" ("userId", "kind", "value") `);
        await queryRunner.query(`ALTER TABLE "user" ADD "suspiciousLoginDetectedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."suspiciousLoginDetectedAt" IS 'The last time an unverifiable suspicious login was detected.'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableLoginRiskDetection" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginRiskNotifyThreshold" integer NOT NULL DEFAULT '30'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginRiskStepUpThreshold" integer NOT NULL DEFAULT '60'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginRiskFlagUnverifiedUsers" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "signin" ADD "country" character varying(2)`);
        await queryRunner.query(`ALTER TABLE "signin" ADD "asn" integer`);
        await queryRunner.query(`ALTER TABLE "signin" ADD "riskScore" smallint`);
        await queryRunner.query(`ALTER TABLE "signin" ADD "riskReasons" character varying(32) array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "signin" ADD "challenge" character varying(16)`);
        await queryRunner.query(`ALTER TABLE "user_login_context" ADD CONSTRAINT "FK_6a9ebce45b963d3c864f2f71392" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_login_context" DROP CONSTRAINT "FK_6a9ebce45b963d3c864f2f71392"`);
        await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "challenge"`);
        await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "riskReasons"`);
        await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "riskScore"`);
        await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "asn"`);
        await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "country"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginRiskFlagUnverifiedUsers"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginRiskStepUpThreshold"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginRiskNotifyThreshold"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableLoginRiskDetection"`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."suspiciousLoginDetectedAt" IS 'The last time an unverifiable suspicious login was detected.'`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "suspiciousLoginDetectedAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a0a25fd51bd6bdd6e4f5633ca9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e78288795f80ce02e5b62d5813"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a9ebce45b963d3c864f2f7139"`);
        await queryRunner.query(`DROP TABLE "user_login_context"`);
    }
}
