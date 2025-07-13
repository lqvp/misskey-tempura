/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixDeliveryTargets1752367649034 {
	name = 'FixDeliveryTargets1752367649034';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "deliveryTargets" jsonb DEFAULT NULL`);
		await queryRunner.query(`CREATE INDEX "IDX_note_deliveryTargets" ON "note" USING gin ("deliveryTargets")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_note_deliveryTargets"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "deliveryTargets"`);
	}
}
