/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class contactForm1741082321743 {
    constructor() {
        this.name = 'contactForm1741082321743';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "contact" ("id" character varying(32) NOT NULL, "subject" character varying(256) NOT NULL, "message" character varying(8192) NOT NULL, "name" character varying(256) NOT NULL, "email" character varying(256) NULL, "misskeyUser" character varying(128) NULL, "category" character varying(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "respondedAt" TIMESTAMP WITH TIME ZONE NULL, "status" character varying(128) NOT NULL DEFAULT 'pending', "note" character varying(8192) NULL, "responseMessage" character varying(8192) NULL, "assigneeId" character varying(32) NULL, CONSTRAINT "CHK_contact_email_misskeyUser" CHECK ("email" IS NOT NULL OR "misskeyUser" IS NOT NULL), CONSTRAINT "PK_contact_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_contact_status" ON "contact" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_contact_createdAt" ON "contact" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_contact_assigneeId" ON "contact" ("assigneeId") `);
        await queryRunner.query(`ALTER TABLE "contact" ADD CONSTRAINT "FK_contact_assigneeId" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "contact" DROP CONSTRAINT "FK_contact_assigneeId"`);
        await queryRunner.query(`DROP INDEX "IDX_contact_assigneeId"`);
        await queryRunner.query(`DROP INDEX "IDX_contact_createdAt"`);
        await queryRunner.query(`DROP INDEX "IDX_contact_status"`);
        await queryRunner.query(`DROP TABLE "contact"`);
    }
}