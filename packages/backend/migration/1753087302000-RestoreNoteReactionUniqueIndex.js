/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RestoreNoteReactionUniqueIndex1753087302000 {
    name = 'RestoreNoteReactionUniqueIndex1753087302000'

    async up(queryRunner) {
        // まず、重複しているリアクションを削除する
        // 同じユーザーが同じノートに複数のリアクションをしている場合、最新のもの以外を削除
        await queryRunner.query(`
            DELETE FROM "note_reaction" nr1
            WHERE EXISTS (
                SELECT 1
                FROM "note_reaction" nr2
                WHERE nr1."userId" = nr2."userId"
                AND nr1."noteId" = nr2."noteId"
                AND nr1.id < nr2.id
            )
        `);

        // ノートのリアクションカウントを再計算して修正
        await queryRunner.query(`
            UPDATE "note"
            SET "reactions" = (
                SELECT jsonb_object_agg(reaction, count)
                FROM (
                    SELECT reaction, COUNT(*) as count
                    FROM "note_reaction"
                    WHERE "noteId" = "note"."id"
                    GROUP BY reaction
                ) AS reaction_counts
            )
            WHERE EXISTS (
                SELECT 1
                FROM "note_reaction"
                WHERE "noteId" = "note"."id"
            )
        `);

        // リアクションがないノートのreactionsを空のJSONオブジェクトに設定
        await queryRunner.query(`
            UPDATE "note"
            SET "reactions" = '{}'::jsonb
            WHERE NOT EXISTS (
                SELECT 1
                FROM "note_reaction"
                WHERE "noteId" = "note"."id"
            )
            AND "reactions" != '{}'::jsonb
        `);

        // reactionAndUserPairCacheも再構築
        await queryRunner.query(`
            UPDATE "note"
            SET "reactionAndUserPairCache" = (
                SELECT array_agg(pair)
                FROM (
                    SELECT "userId" || '/' || "reaction" as pair
                    FROM "note_reaction"
                    WHERE "noteId" = "note"."id"
                    ORDER BY "id" DESC
                    LIMIT 16
                ) AS pairs
            )
            WHERE EXISTS (
                SELECT 1
                FROM "note_reaction"
                WHERE "noteId" = "note"."id"
            )
        `);

        // note_reactionテーブルの(userId, noteId)にユニークインデックスを再作成
        // これにより、同じユーザーが同じノートに複数のリアクションを付けることを防ぐ
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ad0c221b25672daf2df320a817" ON "note_reaction" ("userId", "noteId")`);
    }

    async down(queryRunner) {
        // ロールバック時はインデックスを削除
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ad0c221b25672daf2df320a817"`);
    }
}