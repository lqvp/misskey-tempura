/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FollowRequestHistory1732925378001 {
	name = 'FollowRequestHistory1732925378001'

	async up(queryRunner) {
			await queryRunner.query(`
					CREATE TABLE "follow_request_history" (
							"id" character varying(32) NOT NULL,
							"type" character varying(32) NOT NULL,
							"fromUserId" character varying(32) NOT NULL,
							"toUserId" character varying(32) NOT NULL,
							"timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
							CONSTRAINT "PK_follow_request_history_id" PRIMARY KEY ("id")
					)`);

			await queryRunner.query(`CREATE INDEX "IDX_follow_request_history_from_user" ON "follow_request_history" ("fromUserId")`);
			await queryRunner.query(`CREATE INDEX "IDX_follow_request_history_to_user" ON "follow_request_history" ("toUserId")`);
			await queryRunner.query(`CREATE INDEX "IDX_follow_request_history_timestamp" ON "follow_request_history" ("timestamp")`);
	}

	async down(queryRunner) {
			await queryRunner.query(`DROP INDEX "IDX_follow_request_history_timestamp"`);
			await queryRunner.query(`DROP INDEX "IDX_follow_request_history_to_user"`);
			await queryRunner.query(`DROP INDEX "IDX_follow_request_history_from_user"`);
			await queryRunner.query(`DROP TABLE "follow_request_history"`);
	}
}
