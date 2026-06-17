/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddLlmModerationQueueNoteFk1781401914034 {
	name = 'AddLlmModerationQueueNoteFk1781401914034'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" ADD CONSTRAINT "FK_llm_moderation_queue_noteId" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" DROP CONSTRAINT "FK_llm_moderation_queue_noteId"`);
		await queryRunner.query(`ALTER TABLE "llm_moderation_queue" DROP COLUMN "createdAt"`);
	}
}
