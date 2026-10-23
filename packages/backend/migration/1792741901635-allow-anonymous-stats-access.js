/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousStatsAccess1792741901635 {
    name = 'AllowAnonymousStatsAccess1792741901635'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousStats" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousOnlineUsersCount" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartActiveUsers" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartApRequest" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartDrive" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartFederation" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartInstance" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartNotes" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousChartUsers" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousStats"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousOnlineUsersCount"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartActiveUsers"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartApRequest"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartDrive"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartFederation"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartInstance"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartNotes"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousChartUsers"`);
    }
}
