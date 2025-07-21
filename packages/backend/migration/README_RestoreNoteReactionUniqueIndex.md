# Note Reaction ユニークインデックスの復元

## 問題の説明

`IDX_ad0c221b25672daf2df320a817` インデックスが削除されると、`note_reaction` テーブルの `(userId, noteId)` に対するユニーク制約がなくなり、同じユーザーが同じノートに複数のリアクションを付けられるようになってしまいます。

## 解決方法

`1753087302000-RestoreNoteReactionUniqueIndex.js` マイグレーションファイルは以下の処理を行います：

1. **重複リアクションの削除**: 同じユーザーが同じノートに複数のリアクションをしている場合、最新のもの以外を削除します
2. **リアクションカウントの修正**: ノートの `reactions` フィールドを再計算して正しい値に修正します
3. **キャッシュの再構築**: `reactionAndUserPairCache` を再構築します
4. **ユニークインデックスの再作成**: `(userId, noteId)` に対するユニークインデックスを再作成します

## マイグレーションの実行

```bash
# プロジェクトのルートディレクトリで実行
cd /workspace

# バックエンドディレクトリに移動
cd packages/backend

# マイグレーションを実行
npm run migration:run

# または、pnpmを使用している場合
pnpm migration:run
```

## 確認方法

マイグレーション実行後、以下のSQLクエリでインデックスが作成されていることを確認できます：

```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'note_reaction' 
AND indexname = 'IDX_ad0c221b25672daf2df320a817';
```

## ロールバック

問題が発生した場合は、以下のコマンドでロールバックできます：

```bash
npm run migration:revert
# または
pnpm migration:revert
```

## 注意事項

- このマイグレーションは重複データを削除するため、実行前にデータベースのバックアップを取ることを推奨します
- 大量のデータがある場合、マイグレーションの実行に時間がかかる可能性があります
- 実行中はサービスを停止することを推奨します