/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReplaceGithubLinks1751980434169 {
	name = 'ReplaceGithubLinks1751980434169'
	
	async up(queryRunner) {
			await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/lqvp/misskey-tempura' WHERE "repositoryUrl" = 'https://github.com/misskey-dev/misskey'`);
			await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/lqvp/misskey-tempura/issues/new' WHERE "feedbackUrl" = 'https://github.com/misskey-dev/misskey/issues/new'`);
	}
	async down(queryRunner) {
			await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/misskey-dev/misskey' WHERE "repositoryUrl" = 'https://github.com/lqvp/misskey-tempura'`);
			await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/misskey-dev/misskey/issues/new' WHERE "feedbackUrl" = 'https://github.com/lqvp/misskey-tempura/issues/new'`);
	}
}
