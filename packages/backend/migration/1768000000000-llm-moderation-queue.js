/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LlmModerationQueue1768000000000 {
	name = 'LlmModerationQueue1768000000000'

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "llm_moderation_queue" ("id" character varying(32) NOT NULL, "noteId" character varying(32) NOT NULL, "noteUserId" character varying(32) NOT NULL, "noteUserHost" character varying(128), "noteVisibility" character varying(64) NOT NULL, "isRemote" boolean NOT NULL DEFAULT false, "provider" character varying(32) NOT NULL, "model" character varying(128) NOT NULL, "flaggedCategories" character varying(128) array NOT NULL DEFAULT '{}', "categoryScores" jsonb NOT NULL, "rawResult" jsonb, "resolved" boolean NOT NULL DEFAULT false, "assigneeId" character varying(32), "moderationNote" character varying(8192) NOT NULL DEFAULT '', CONSTRAINT "PK_llm_moderation_queue_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_llm_moderation_queue_noteUserId" ON "llm_moderation_queue" ("noteUserId")`);
		await queryRunner.query(`CREATE INDEX "IDX_llm_moderation_queue_noteUserHost" ON "llm_moderation_queue" ("noteUserHost")`);
		await queryRunner.query(`CREATE INDEX "IDX_llm_moderation_queue_isRemote" ON "llm_moderation_queue" ("isRemote")`);
		await queryRunner.query(`CREATE INDEX "IDX_llm_moderation_queue_resolved" ON "llm_moderation_queue" ("resolved")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "UQ_llm_moderation_queue_noteId" ON "llm_moderation_queue" ("noteId")`);
		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" ADD CONSTRAINT "FK_llm_moderation_queue_assignee" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationApiKey" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationIncludeRemote" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "openLlmModerationVisibilities" character varying(64) array NOT NULL DEFAULT '{public,public_non_ltl,home,followers,specified}'`);
	}

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationVisibilities"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationIncludeRemote"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationApiKey"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "openLlmModerationEnabled"`);

		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" DROP CONSTRAINT "FK_llm_moderation_queue_assignee"`);
		await queryRunner.query(`DROP INDEX "UQ_llm_moderation_queue_noteId"`);
		await queryRunner.query(`DROP INDEX "IDX_llm_moderation_queue_resolved"`);
		await queryRunner.query(`DROP INDEX "IDX_llm_moderation_queue_isRemote"`);
		await queryRunner.query(`DROP INDEX "IDX_llm_moderation_queue_noteUserHost"`);
		await queryRunner.query(`DROP INDEX "IDX_llm_moderation_queue_noteUserId"`);
		await queryRunner.query(`DROP TABLE "llm_moderation_queue"`);
	}
}
