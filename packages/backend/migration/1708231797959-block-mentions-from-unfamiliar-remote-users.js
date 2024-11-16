/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class BlockMentionsFromUnfamiliarRemoteUsers1708231797959 {
    name = 'BlockMentionsFromUnfamiliarRemoteUsers1708231797959'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "blockMentionsFromUnfamiliarRemoteUsers" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "blockMentionsFromUnfamiliarRemoteUsers"`);
    }
}
