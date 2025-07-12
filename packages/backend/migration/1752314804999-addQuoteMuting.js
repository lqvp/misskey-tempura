/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddQuoteMuting1752314804999 {
	name = 'AddQuoteMuting1752314804999';

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "quote_muting" (
				"id" character varying(32) NOT NULL,
				"muteeId" character varying(32) NOT NULL,
				"muterId" character varying(32) NOT NULL,
				CONSTRAINT "PK_quoteMuting_id" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_quote_muting_muteeId" ON "quote_muting" ("muteeId")`);
		await queryRunner.query(`CREATE INDEX "IDX_quote_muting_muterId" ON "quote_muting" ("muterId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_quote_muting_muterId_muteeId" ON "quote_muting" ("muterId", "muteeId")`);
		await queryRunner.query(`ALTER TABLE "quote_muting" ADD CONSTRAINT "FK_quote_muting_muteeId" FOREIGN KEY ("muteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "quote_muting" ADD CONSTRAINT "FK_quote_muting_muterId" FOREIGN KEY ("muterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "quote_muting" DROP CONSTRAINT "FK_quote_muting_muterId"`);
		await queryRunner.query(`ALTER TABLE "quote_muting" DROP CONSTRAINT "FK_quote_muting_muteeId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_quote_muting_muterId_muteeId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_quote_muting_muterId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_quote_muting_muteeId"`);
		await queryRunner.query(`DROP TABLE "quote_muting"`);
	}
}
