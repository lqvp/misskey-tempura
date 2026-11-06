/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ProxyAccountFollowMode1793715141496 {
    name = 'ProxyAccountFollowMode1793715141496'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "proxyAccountFollowMode" character varying(32) NOT NULL DEFAULT 'skipIfFollowed'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "proxyAccountFollowMode"`);
    }
}
