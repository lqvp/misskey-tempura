/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class FollowHistory1733272213376 {
	name = 'FollowHistory1733272213376';
	async up(queryRunner) {
		await queryRunner.query(`
					CREATE TABLE "follow_history" (
							"id" character varying(32) NOT NULL,
							"type" character varying(32) NOT NULL,
							"fromUserId" character varying(32) NOT NULL,
							"toUserId" character varying(32) NOT NULL,
							"timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
							CONSTRAINT "PK_follow_history_id" PRIMARY KEY ("id")
					)`);
		await queryRunner.query('CREATE INDEX "IDX_follow_history_from_user" ON "follow_history" ("fromUserId")');
		await queryRunner.query('CREATE INDEX "IDX_follow_history_to_user" ON "follow_history" ("toUserId")');
		await queryRunner.query('CREATE INDEX "IDX_follow_history_timestamp" ON "follow_history" ("timestamp")');
	}
	async down(queryRunner) {
		await queryRunner.query('DROP INDEX "IDX_follow_history_timestamp"');
		await queryRunner.query('DROP INDEX "IDX_follow_history_to_user"');
		await queryRunner.query('DROP INDEX "IDX_follow_history_from_user"');
		await queryRunner.query('DROP TABLE "follow_history"');
	}
}
