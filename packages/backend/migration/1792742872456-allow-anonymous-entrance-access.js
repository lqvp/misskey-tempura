/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AllowAnonymousEntranceAccess1792742872456 {
    name = 'AllowAnonymousEntranceAccess1792742872456'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousFederationInstances" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "allowAnonymousFeatured" boolean NOT NULL DEFAULT false`);
        // 既存の挙動を維持するため、entrance 系の現行値を初期値としてコピーする
        await queryRunner.query(`UPDATE "meta" SET "allowAnonymousFederationInstances" = "entranceShowFederation"`);
        await queryRunner.query(`UPDATE "meta" SET "allowAnonymousFeatured" = "entranceShowFeatured"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousFederationInstances"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowAnonymousFeatured"`);
    }
}
