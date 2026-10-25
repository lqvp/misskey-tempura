/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSsoLinkIssuer1792862660352 {
    name = 'AddSsoLinkIssuer1792862660352'

    async up(queryRunner) {
        // 連携を作成した発行者の識別子。既存の連携 (発行者が不明) は空文字になり、
        // どの発行者とも一致しないため SSO ログインできなくなる (安全側)。連携を解除して作り直すと復旧する
        await queryRunner.query(`ALTER TABLE "user_sso_link" ADD "providerIssuer" varchar(1100) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "user_sso_link" ALTER COLUMN "providerIssuer" DROP DEFAULT`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_sso_link" DROP COLUMN "providerIssuer"`);
    }
}
