/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class customizeEntrance1738513270655 {
	name = 'customizeEntrance1738513270655'

		async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowTimeLine" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowFeatured" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowEmojis" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceSelectEmojis" character varying(1024) array NOT NULL DEFAULT '{ "👍", "❤", "😆", "🎉", "🍮" }'`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowStats" boolean NOT NULL DEFAULT false`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowFederation" boolean NOT NULL DEFAULT false`);
			await queryRunner.query('ALTER TABLE "meta" ADD "entranceShowDashboard" boolean NOT NULL DEFAULT true');
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowSignup" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowAnotherInstance" boolean NOT NULL DEFAULT true`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "entranceShowSignin" boolean NOT NULL DEFAULT true`);
			await queryRunner.query('ALTER TABLE "meta" ADD "entranceMarginLeft" character varying(1024) NOT NULL DEFAULT \'120\'');
			await queryRunner.query('ALTER TABLE "meta" ADD "entranceMarginRight" character varying(1024) NOT NULL DEFAULT \'0\'');
			await queryRunner.query('ALTER TABLE "meta" ADD "entranceMarginTop" character varying(1024) NOT NULL DEFAULT \'0\'');
			await queryRunner.query('ALTER TABLE "meta" ADD "entranceMarginBottom" character varying(1024) NOT NULL DEFAULT \'0\'');
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowTimeLine"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowFeatured"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowEmojis"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceSelectEmojis"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowStats"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowFederation"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowDashboard"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowSignup"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowAnotherInstance"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceShowSignin"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceMarginLeft"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceMarginRight"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceMarginTop"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "entranceMarginBottom"`);
	}
}
