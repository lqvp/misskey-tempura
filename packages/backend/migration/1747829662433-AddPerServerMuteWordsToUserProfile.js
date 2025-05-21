/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddPerServerMuteWordsToUserProfile1747829662433 {
    name = 'AddPerServerMuteWordsToUserProfile1747829662433'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "perServerMuteWords" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."perServerMuteWords" IS 'List of per-server mute words settings by the user.'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."perServerMuteWords" IS NULL`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "perServerMuteWords"`);
    }
}
