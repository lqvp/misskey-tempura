/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LoginRiskSecret1792454960231 {
    name = 'LoginRiskSecret1792454960231'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginRiskSecret" character varying(128)`);
        // これまでの端末とプレフィックスは公開の固定鍵でハッシュ化していて、新しい鍵では照合できないので消す。
        // 国と ASN は平文なので残す。端末トークンは次のログインで発行し直される
        await queryRunner.query(`DELETE FROM "user_login_context" WHERE "kind" IN ('device', 'prefix')`);
    }

    async down(queryRunner) {
        // up で消した学習データは戻せない。スキーマだけを戻す
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginRiskSecret"`);
    }
}
