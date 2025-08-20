/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddWebFeedFilter1754477174992 {
	name = 'AddWebFeedFilter1754477174992';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "user_profile" ADD "webFeedFilter" jsonb NOT NULL DEFAULT \'{"disableRss": false, "disableAtom": false, "disableJson": false}\'');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "webFeedFilter"');
	}
}
