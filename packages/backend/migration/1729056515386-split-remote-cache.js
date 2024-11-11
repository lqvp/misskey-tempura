/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SplitRemoteCache1729056515386 {
	name = 'SplitRemoteCache1729056515386';

	async up(queryRunner) {
		await queryRunner.query(`
            ALTER TABLE "meta"
            ADD "objectStoragePrefixForRemote" character varying(1024)
        `);
	}

	async down(queryRunner) {
		await queryRunner.query(`
            ALTER TABLE "meta" DROP COLUMN "objectStoragePrefixForRemote"
        `);
	}
};
