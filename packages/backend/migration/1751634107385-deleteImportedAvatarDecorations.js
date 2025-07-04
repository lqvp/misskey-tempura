/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class deleteImportedAvatarDecorations1751634107385 {
		name = 'deleteImportedAvatarDecorations1751634107385';

		async up(queryRunner) {
			await queryRunner.query(`DELETE FROM "avatar_decoration" WHERE "name" LIKE 'import_%'`);
		}

		async down(queryRunner) {
			// This migration is irreversible.
		}
}

