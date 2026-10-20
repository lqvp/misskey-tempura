/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 1751980434169-replaceGithubLinks は既存行の UPDATE だけで列の DEFAULT を変えていなかった。
// 新規インストールではその後に meta 行が DB の DEFAULT (misskey-dev) で作られるので、DEFAULT を直してから置き換えをやり直す
export class FixTempuraRepositoryLinks1792456828540 {
    name = 'FixTempuraRepositoryLinks1792456828540'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/lqvp/misskey-tempura'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/lqvp/misskey-tempura/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/lqvp/misskey-tempura' WHERE "repositoryUrl" IN ('https://github.com/misskey-dev/misskey', 'https://github.com/misskey-dev/misskey/')`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/lqvp/misskey-tempura/issues/new' WHERE "feedbackUrl" IN ('https://github.com/misskey-dev/misskey/issues/new', 'https://github.com/misskey-dev/misskey/issues/new/')`);
    }

    async down(queryRunner) {
        // 置き換えた値は管理者が設定した値と区別できないので戻さない
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey/issues/new'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey'`);
    }
}
