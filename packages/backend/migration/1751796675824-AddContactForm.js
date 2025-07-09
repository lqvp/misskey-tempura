/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddContactForm1751796675824 {
	name = 'AddContactForm1751796675824';

	async up(queryRunner) {
		// contact_formテーブルの作成
		await queryRunner.query(`CREATE TABLE "contact_form" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE, "subject" character varying(256) NOT NULL, "content" text NOT NULL, "replyMethod" character varying(32) NOT NULL, "name" character varying(256), "email" character varying(512), "misskeyUsername" character varying(128), "category" character varying(32) NOT NULL DEFAULT 'other', "status" character varying(32) NOT NULL DEFAULT 'pending', "adminNote" text, "ipAddress" character varying(45), "userAgent" character varying(1024), "userId" character varying(32), "assignedUserId" character varying(32), "assignedNickname" character varying(128), CONSTRAINT "PK_contact_form" PRIMARY KEY ("id"))`);

		// インデックスの作成
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_createdAt" ON "contact_form" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_replyMethod" ON "contact_form" ("replyMethod")`);
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_category" ON "contact_form" ("category")`);
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_status" ON "contact_form" ("status")`);
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_userId" ON "contact_form" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_contact_form_assignedUserId" ON "contact_form" ("assignedUserId")`);

		// 外部キー制約の追加
		await queryRunner.query(`ALTER TABLE "contact_form" ADD CONSTRAINT "FK_contact_form_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "contact_form" ADD CONSTRAINT "FK_contact_form_assignedUserId" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

		// metaテーブルにcontact_form関連設定を追加
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableContactForm" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "contactFormLimit" integer NOT NULL DEFAULT 3`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "contactFormRequireAuth" boolean NOT NULL DEFAULT false`);

		// ContactFormカテゴリ設定を追加（動的管理用）
		await queryRunner.query(`ALTER TABLE "meta" ADD "contactFormCategories" jsonb NOT NULL DEFAULT '[
			{"key": "general", "text": "一般", "enabled": true, "order": 1, "isDefault": true},
			{"key": "bug_report", "text": "バグ報告", "enabled": true, "order": 2, "isDefault": false},
			{"key": "feature_request", "text": "機能要望", "enabled": true, "order": 3, "isDefault": false},
			{"key": "account_issue", "text": "アカウント関連", "enabled": true, "order": 4, "isDefault": false},
			{"key": "technical_issue", "text": "技術的な問題", "enabled": true, "order": 5, "isDefault": false},
			{"key": "content_issue", "text": "コンテンツ関連", "enabled": true, "order": 6, "isDefault": false},
			{"key": "other", "text": "その他", "enabled": true, "order": 7, "isDefault": false}
		]'::jsonb`);
	}

	async down(queryRunner) {
		// metaテーブルから設定を削除
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "contactFormRequireAuth"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "contactFormLimit"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableContactForm"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "contactFormCategories"`);

		// 外部キー制約の削除
		await queryRunner.query(`ALTER TABLE "contact_form" DROP CONSTRAINT "FK_contact_form_assignedUserId"`);
		await queryRunner.query(`ALTER TABLE "contact_form" DROP CONSTRAINT "FK_contact_form_userId"`);

		// インデックスの削除
		await queryRunner.query(`DROP INDEX "IDX_contact_form_assignedUserId"`);
		await queryRunner.query(`DROP INDEX "IDX_contact_form_userId"`);
		await queryRunner.query(`DROP INDEX "IDX_contact_form_status"`);
		await queryRunner.query(`DROP INDEX "IDX_contact_form_category"`);
		await queryRunner.query(`DROP INDEX "IDX_contact_form_replyMethod"`);
		await queryRunner.query(`DROP INDEX "IDX_contact_form_createdAt"`);

		// contact_formテーブルの削除
		await queryRunner.query(`DROP TABLE "contact_form"`);
	}
}

