# Issue #414: YouTubeなどの追跡クエリをノート時に削除する

## 実装内容

### 概要
ノート作成時に、YouTube、Twitter、Amazon、その他のサービスのURLから追跡パラメータを自動的に削除する機能を実装しました。これにより、URLが短くなり、プライバシーが向上します。

### 実装詳細

#### 1. URL サニタイズユーティリティの作成
- **ファイル**: `packages/backend/src/misc/sanitize-url.ts`
- **機能**: URLから追跡パラメータを削除する関数 `sanitizeUrls` を実装
- **対応パラメータ**:
  - YouTube: `si`, `feature`, `pp`
  - Twitter/X: `s`, `t`, `ref_src`, `ref_url`
  - Facebook: `fbclid`, `fb_action_ids`, `fb_action_types`, `fb_source`
  - Google: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `gclid`, `gclsrc`, `dclid`
  - Amazon: `tag`, `linkCode`, `linkId`, `ref_`, `pf_rd_*` (プレフィックスマッチ)
  - Instagram: `igshid`, `igsh`
  - TikTok: `_t`, `_r`
  - その他: `source`, `mc_cid`, `mc_eid`, `affiliate`, `app`, `partner`

#### 2. NoteCreateService への統合
- **ファイル**: `packages/backend/src/core/NoteCreateService.ts`
- **変更内容**:
  - `sanitizeUrls` 関数をインポート
  - ノートのテキスト処理時にURL サニタイズを適用
  - CW (Content Warning) フィールドにもURL サニタイズを適用

#### 3. テストの追加
- **ファイル**: `packages/backend/test/unit/misc/sanitize-url.ts`
- **テスト内容**:
  - 各サービスの追跡パラメータ削除
  - 複数URLの処理
  - 非追跡パラメータの保持
  - 不正なURLの処理
  - 空のテキストやURLなしテキストの処理

### 技術的な特徴

1. **安全性**: 不正なURLの場合は元のURLを返すため、エラーが発生しない
2. **効率性**: 正規表現を使用してURLを検出し、必要な場合のみ処理
3. **拡張性**: 追跡パラメータのリストは簡単に追加可能
4. **特殊処理**: Amazonドメインでは`pf_rd_`や`ref_`で始まるすべてのパラメータを削除

### 動作例

**入力**:
```
Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abcd1234&feature=share
```

**出力**:
```
Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### 今後の拡張可能性

1. ユーザー設定でURL サニタイズのオン/オフを切り替え可能にする
2. 追跡パラメータのカスタマイズ機能
3. 削除されたパラメータの通知機能
4. より多くのサービスへの対応

### 関連ファイル

- `packages/backend/src/misc/sanitize-url.ts` - URL サニタイズユーティリティ
- `packages/backend/src/core/NoteCreateService.ts` - ノート作成サービス（統合箇所）
- `packages/backend/test/unit/misc/sanitize-url.ts` - ユニットテスト