# Typecheck Fix Plan (frontend/backend, Dec 2025)

このメモは現在の差分と、残っている型エラーの解消タスクをまとめたものです。

## 現在の主な差分

- **backend**
  - `packages/backend/src/server/api/stream/Connection.ts`  
    Promise.all の要素数ミスマッチを修正。
  - `packages/backend/test/e2e/timelines.ts`  
    役割作成モックを最新 API に合わせ `permissionGroup: 'Normal'` を追加。

- **frontend**
  - `packages/frontend/src/components/global/MkAvatar.vue`  
    Props を必要最小限の UserLike に緩和。
  - `packages/frontend/src/components/global/MkUserName.vue`  
    同上。
  - `packages/frontend/src/components/MkUserCardMini.vue`  
    同上。
  - `packages/frontend/src/components/MkFollowButton.vue`  
    `hasPendingFollowRequestFromYou` を追加、emit 型を緩和、i18n 引数をガード。
  - `packages/frontend/.storybook/fakes.ts`  
    misskey-js の型変更に合わせて一部フィールドを補完（`dontShowOnLtl` など）／URI を `undefined` 化。
  - `packages/frontend/tsconfig.json`  
    strictTemplates 緩和は撤回し、元の設定に戻してある。

## 残っている主な型エラーと対応タスク

1. **Storybook フェイクの不足**  
   - `userDetailed` に新必須フィールド（communityRoles, ListenBrainz など）がある場合は埋める。  
   - role/note モックの必須フィールドを再確認。

2. **i18n キー不一致**  
   - `MkAbuseReport.vue`: `copyId/copyJson` を現行キーに置換または削除。  
   - `MkAnnouncementDialog.stories.impl.ts`: `forYourRoles`, `roleNames` をモックに追加。

3. **可視性リテラルの追加**  
   - `public_non_ltl` を Union に追加し、`MkPostForm.vue`, `direct-renote.ts`, `get-note-menu.ts` などを揃える。  
   - `Notification` の `note:grouped` で `noteIds` が無い問題は型分岐またはモック追加。

4. **ノート系必須フィールド**  
   - `deliveryTargets.hosts` を `hosts ?? []` で満たす。  
   - `viaKeyboard` プロパティ削除、`renoteButton` を `ShallowRef<HTMLElement | null>` に合わせる。

5. **個別コンポーネント修正**  
   - `MkFeaturedPhotos.vue`: `imgUrl` を string に。  
   - `MkHistoryViewer.vue`: unknown user で空オブジェクトを渡さない（ダミーユーザーを渡す）。  
   - `MkInstanceTicker.vue`: undefined ガードと optional `softwareVersion`。  
   - `MkReactionsViewer.reaction.vue`: boolean を ref として扱う修正。

6. **Signin / SignupInvitation**  
   - レスポンス型変更に追随（`credential`, `signinResponse`, `code` など）。

7. **TutorialDialog**  
   - user モックに `approved` など必須フィールドを追加。

8. **Settings 系**  
   - `tempura-privacy.vue`, `tempura-profile.vue`: `$i` null ガード、重複スプレッド削除。  
   - `pref-migrate.ts`: `imageCompressionMode`, `geminiModels` を State で実在するキー名に修正。

9. **Select items の label 欠落**  
   - `get-user-menu.ts`, `text-transformations.ts`, `WidgetNestedWidget.vue` などを `{ label, value }` 形式に。

10. **その他**  
    - `welcome.entrance.hana.vue`: CSS 変数に null を入れない（空文字フォールバック）。  
    - `timeline.vue`: `Tab` に必須 `key` を追加。  
    - `user/home.vue`: `communityRoles` の表示条件を optional 化、翻訳ボタン用の `isForeignLanguage`, `translating`, `translation`, `translate` を定義。

## 次のステップ

上記 1〜10 を順に解消し、最後に `pnpm --filter frontend typecheck` と `pnpm --filter frontend lint` を通す。必要に応じて小分けコミットを推奨。
