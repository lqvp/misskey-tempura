export class AllowMultipleReactions1753087607000 {
    name = 'AllowMultipleReactions1753087607000'

    async up(queryRunner) {
        // 既存のユニークインデックスを削除
        await queryRunner.query(`DROP INDEX "IDX_ad0c221b25672daf2df320a817"`);
        
        // 新しい非ユニークインデックスを作成（パフォーマンスのため）
        await queryRunner.query(`CREATE INDEX "IDX_ad0c221b25672daf2df320a817_non_unique" ON "note_reaction" ("userId", "noteId")`);
        
        // reaction列にもインデックスを追加（同じリアクションの検索効率化のため）
        await queryRunner.query(`CREATE INDEX "IDX_reaction_type" ON "note_reaction" ("noteId", "reaction")`);
    }

    async down(queryRunner) {
        // インデックスを削除
        await queryRunner.query(`DROP INDEX "IDX_reaction_type"`);
        await queryRunner.query(`DROP INDEX "IDX_ad0c221b25672daf2df320a817_non_unique"`);
        
        // 重複するリアクションを削除（最新のものを残す）
        await queryRunner.query(`
            DELETE FROM note_reaction
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT MAX(id) as id
                    FROM note_reaction
                    GROUP BY "userId", "noteId"
                ) as keep_ids
            )
        `);
        
        // ユニークインデックスを再作成
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ad0c221b25672daf2df320a817" ON "note_reaction" ("userId", "noteId")`);
    }
}