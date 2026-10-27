# Misskey-Tempura フォーク機能一覧

Misskey-Tempura は Misskey をフォークした実装です。本家 Misskey にはない、または異なる動作をする機能をまとめます。本家に既にある機能 (予約投稿など) はここでは扱いません。

注意事項

* 本ページは HackMD のバージョン差分ページを置き換える用途を想定しています。アプリ内の /tempura-changelog は HackMD を取得してバージョン見出しを解析するため、置き換えると表示が空になる可能性があります。必要なら取得先や解析処理の変更を検討してください。
* 一部の機能はロール権限やサーバー設定で有効化が必要です。
* 記載内容は 2026.10.1-tempura-2.0.21-dev 時点のコードに基づきます。

## 本家との大きな違い

* ログインリスク判定と確認コード
* フォロー履歴とフォローリクエスト履歴
* 引用ミュートとアバター装飾ミュート
* セミパブリック (public_non_ltl) と受信指定ノート
* 配送先制御 (delivery targets)
* アカウント整理 (truncate)
* ノートの非公開化 (make private)
* LLM モデレーションと Gemini 連携
* 問い合わせフォーム
* 地震情報
* Hana entrance
* カスタムスプラッシュ/背景画像/カーソル/長いアイコン
* サーバー統計の偽装
* DeepLX 無料モード
* 署名必須の ActivityPub 取得
* 検疫 (quarantine)
* マルチパートアップロード
* IP インテリジェンス
* 天気ウィジェット (Open-Meteo)
* ListenBrainz ウィジェット
* 太鼓ゲームページ
* ネストウィジェット
* 連合ジョブキュー
* fxtwitter 経由の X 埋め込み
* ニックネーム (クライアント側)
* テーマ night-pink と pink-candy
* カスタムフォント

## セキュリティとプライバシー

### ログインリスク判定

* IP インテリジェンス (国/ASN/プレフィックス/Tor/VPN/データセンター/Spamhaus DROP) を用いてログインのリスク点数を計算します
* 閾値 (notify/stepUp) で allow / notify / stepUp を判定します
* 新しい端末/国/ASN/プレフィックス、直近の他国ログイン、休眠アカウント、失敗回数、IP スプレーなどを加点します
* learning 期間中は stepUp を notify に抑えます
* 不審と判定した場合は確認コード (email code) を要求します
* 管理者は login-risk/diagnose と user-footprints で診断できます
* 不審ログインの記録は本人に見せるかどうかを設定できます
* ログイン失敗時には通知 (loginFailed) が送られます

### IP インテリジェンス

* sapics の MMDB を日次で取得し Redis に版管理します
* 国/ASN の判定に使います
* 管理画面で状態を確認できます

### 署名必須の ActivityPub 取得

* requireSignedApFetch が有効なとき、HTTP Signature を検証できない AP 取得を拒否します
* アカウント/公開鍵取得は例外 (鍵交換のため)

### 検疫

* インスタンスを quarantineLimited にすると、そのサーバーへの配送は公開コンテンツのみになります
* 隔離中のサーバーからのアクセス制御も行われます
* 管理者は quarantineRemoteInstance / unquarantine で切り替えます

### ActivityPub アクセス制御

* ブロック/停止/検疫に応じて AP 取得を制御します
* 配送先 include/exclude リストに従ってノートアクセスを制御します

### 匿名アクセスへの非公開設定の一貫適用

* 未ログインの Web アクセスと署名なしの ActivityPub 取得を「匿名アクセス」として扱い、ノートの公開判定を共有述語 (misc/visitor-note-visibility.ts) に共通化しました
* SSR/OGP・埋め込み (/embed/notes/:id)・ActivityPub の /notes/:id・/notes/:id/activity・outbox で、requireSigninToViewContents・hidePublicNotes/hideHomeNotes・時限設定 (makeNotesHiddenBefore/makeNotesFollowersOnlyBefore)・localOnly・ugcVisibilityForVisitor を反映します
* 署名が無い・検証できない取得は匿名に分類します。署名者の鍵をまだ知らない場合は、インスタンス登録済みのホストに限りアカウントを取りに行って検証します (署名必須モードと同じ方針)。未登録ホストの署名者は匿名に分類します
* 署名を検証できたリモートサーバーからの取得と、配送済みのコピーは対象外です
* API でも Pages (pages/show, pages/featured)・Clips (clips/show, clips/notes)・Channels (channels/show, channels/featured)・ユーザー検索 (users/search) に同じポリシーを適用します。ugcVisibilityForVisitor が 'none' の間は匿名には返さず、'local' の間は匿名のユーザー検索をローカルユーザーに限定します (users/show と同じ扱い)

### 招待と承認

* approvalRequiredForSignup でサインアップ承認制を有効化できます
* 承認待ちユーザー一覧 (/admin/approvals) で承認/拒否できます
* 承認拒否時には通知が送られます
* 招待コード (invite) でメール認証や承認をスキップできます (ロール権限 canSkipInviteEmailAuth / canSkipInviteApproval が必要)
* 招待コードの有効期限を設定できます

### メールドメインホワイトリスト

* emailWhitelist が有効なとき、指定ドメインのみ登録できます

### 登録制限

* secondsPerSignup で登録間隔を制限できます (0 で無効、招待コードはバイパス)
* validateMinimumUsernameLength でユーザー名の最低文字数を設定できます (デフォルト 5)
* blockMentionsFromUnfamiliarRemoteUsers で、ローカルフォロワーがいないリモートユーザーからのメンション付きノートをブロックできます (デフォルト true)
* carefulBot で Bot のフォローに承認を要求できます
* autoRejectFollowRequest で、フォロー済みユーザー以外からのフォローリクエストを自動拒否できます

### Bot フォロー承認

* Bot のフォローには管理者の承認が必要になります

## ノートと公開範囲

### セミパブリック

* public_non_ltl: LTL には出さない public ノート
* visibility coloring で公開範囲を色分け表示できます

### 受信指定ノート

* receiveSpecifiedNotesFrom で、DM 的なノートを誰から受信するか (all / following / nobody) を選べます
* 返信相手と管理者/モデレーターは常に受信できます

### アウトボックスと Web フィード

* outboxFilter でアウトボックスに含める公開範囲 (public / public_non_ltl / home) を選びます
* webFeedFilter で RSS/Atom/JSON フィードを無効化できます

### 配送先制御

* ノート投稿時に配送先サーバーを include / exclude で指定できます
* フォロワー一覧のサーバーから選択します

### すぐ消す (scheduledNoteDelete)

* ノート投稿時に自動削除時刻を設定できます
* defaultScheduledNoteDelete / defaultScheduledNoteDeleteTime でデフォルトを設定できます
* 1 年以上先には設定できません
* 削除の代わりに非公開化する選択 (makePrivateInsteadOfDelete) があります

### ノートの非公開化 (make private)

* 既存ノートを一括で非公開 (specified) にできます
* make-private / make-private-many / make-private-many-count エンドポイントがあります
* 1 時間に 1 回まで (irreversible 警告あり)
* ノートと添付ファイルを削除する deleteWithFiles オプションがあります

### 引用とリノート

* directRenote でメニューを出さずに直接リノートできます
* 引用は肉球メニューに移動します
* 引用ミュートで、特定ユーザーの引用通知を抑制できます

### ノート検索

* withFiles / cw / reply / poll フィルタ
* AND / OR 検索、除外語、日付範囲
* pgroonga の高度な構文をサポートします

### ノートの最大文字数

* MAX_NOTE_TEXT_LENGTH は 8192 です

### 見たリノートの記録

* enableViewedRenotes で見たリノートを記録し、折りたたみ表示できます

### ノートの匿名化/色分け

* noteVisibilityColoring で公開範囲ごとに色を付けます
* ミュートしたユーザーの名前とアイコンをサーバー情報に置き換える anonymizeMutedUsers があります

### 非表示設定

* hidePublicNotes / hideHomeNotes / hideLocalOnlyNotes / hideNoteFromOverview でログアウトユーザーに非表示にできます (ログインユーザーには表示)
* hideActivity でアクティビティを非表示にできます

## リアクション

* selectReaction でデフォルトリアクションを変更できます (デフォルト 🩷)
* showLikeButton でいいねボタンを表示できます
* hideReactionUsers / hideReactionCount でリアクションユーザー/件数を隠せます
* enableReactionConfirm / enableLikeConfirm で確認ダイアログを出せます
* reactionChecksMuting でリアクションもミュートを尊重します (トラフィック増)
* addToEmojiPicker でカスタム絵文字をピッカーに追加できます
* reaction-stats でリアクション統計 (合計/ユニーク/最多) を見られます

## ミュートとブロック

* 引用ミュート (quote mute): 特定ユーザーの引用をミュート (期限付き)
* アバター装飾ミュート: 特定ユーザーのアバター装飾を非表示 (期限付き)
* ミュートしたユーザーの匿名化
* ミュート期間の設定 (MkMuteDialog)

## フォローと履歴

### フォロー履歴

* follow / unFollow / wasFollow / wasUnFollow / blocked / unBlocked / wasBlocked / wasUnBlocked を記録します
* フィルタと全削除ができます
* canReadFollowHistory 権限が必要です

### フォローリクエスト履歴

* sent / received / approved / rejected / wasApproved / wasRejected / wasBlocked / wasUnBlocked を記録します
* フィルタと全削除ができます

### フォロー制御

* autoFollowBack: フォロー返しを自動化 (ロール権限 canAutoFollowBack)
* autoFollowOnMove: 移動時の自動フォロー
* defaultFollowedUsers: 新規ユーザーが自動フォローするユーザー
* forciblyFollowedUsers: 解除/ミュート/ブロックできない強制フォロー
* carefulBot: Bot フォローに承認要求
* autoRejectFollowRequest: フォロー済み以外を自動拒否

### フォロー通知

* youGotUnFollower / followRequestRejected / youGotBlocked / youGotUnblocked 通知
* unfollow 通知は canUseUnFollowNotification で制御
* blocked/unblocked 通知は canUseBlockedNotification / canUseUnBlockedNotification で制御

## モデレーション

### LLM モデレーション

* OpenAI 互換の moderations API を使い、投稿をモデレーター確認待ちにします
* 設定: 有効化/API キー/API URL/モデル/リモート含む/公開範囲
* キュー (/admin/llm-moderation) で warnUser / deleteNote / suspendUser / resolve
* モデレーターに通知が送られます

### 管理者操作

* approve-user / decline-user: 承認制サインアップの承認/拒否
* drop-all-notes: ユーザーの全ノート削除
* regenerate-user-token: トークン再生成
* send-notification: 通知送信
* update-user-name: ユーザー名変更
* clear-suspicious-login-flag: 不審ログインフラグ解除
* unsetUserMutualLink: 相互フォロー解除
* accountTruncate: 公開ノートとドライブファイルを削除 (DM とピン留めは保持)

### 検疫と配信制御

* quarantineRemoteInstance / unquarantine
* delivery targets による配信先制御

### ロール

* community role: ユーザーが作成できるロール
* isRainbow: レインボーロール
* canHomeNote / canEmojiDeletion / canUseRemoteIconDecorations / canAddRoles / canCreateRole
* canUseUnFollowNotification / canUseBlockedNotification / canUseUnBlockedNotification
* canPublicNonLtlNote / canReadFollowHistory / canAutoFollowBack
* canUseTruncate / canUseMakePrivate / canUpdateCounters
* canUseGeminiLLMAPI / canSkipInviteEmailAuth / canSkipInviteApproval
* role conditions: isSuspiciousLoginDetected / activatedMoreThan / activatedLessThan
* announcement target roles (AnnouncementRole)

### コンタクトフォーム

* 有効化/IP あたりの時間制限/認証必須
* カテゴリ/件名/本文 (20 文字以上)/名前/返信方法 (email or Misskey)
* 管理画面で pending/inProgress/resolved/closed を管理

## LLM 連携

### サーバーLLM利用統計

* 管理画面からサーバーAPIキーによる生成の月次利用状況を確認できます。個人APIキーによる利用は集計しません。
* UTC日別にリクエスト・成功・失敗と取得できた各トークン数を集計し、目的・モデル・利用アカウントごとに表示します。利用アカウント数は期間内の重複を除きます。
* 統計APIは管理者専用です。アプリトークンには専用の `read:admin:llm-usage` 権限も必要です。
* アカウント削除後も期限内の統計を保持します。本文・プロンプト・生成結果・APIキー・対象ノートIDは保存しません。
* 保持期間は既定12か月(当月を含むUTC暦月)、0で無期限です。短縮時は具体的なUTC境界日を確認し、次回以降の清掃で段階的に削除します。削除済み統計は延長しても戻りません。
* 不明なトークン値と実測0を区別し、大きな整数は表で正確に表示します。記録失敗や待機上限による欠落があり、欠落件数は未計測です。請求額ではありません。
* この機能のmigrationを巻き戻すと、新しい統計テーブルと統計設定が削除されます。既存のユーザー・ノートは削除しません。


### サーバー Gemini

* serverGeminiEnabled / apiKey / models
* useGeminiLLMAPI でユーザーが利用
* useGeminiWithMedia でメディア付き
* geminiToken / geminiModel
* system prompt と note/profile summarize prompts
* ノート変換 (long/short/simple/casual/professional/cat/custom)
* thinking budget (-1 で無制限)
* notesLimitPrompt / includeFollowersNotesPrompt

### LLM モデレーション

* 上記参照

## 通知

* unfollow / followRequestRejected / blocked / unblocked / loginFailed / llmModerationQueue / receivedContactForm / roleAssigned
* newNotes / notedBySomeUsers / renoteedBySomeUsers (grouped)
* メール通知 (unfollow/blocked/unblocked)
* loginDescription に IP を含む

## プロフィールと表示

### カスタム表示

* customSplashText: 複数行のスプラッシュ
* backgroundImageUrls: 背景画像
* enableLongIconUrl / longIconUrl: 長いアイコン URL
* customCursor: 5 種類の URL
* customFont: カスタムフォント
* nicknameEnabled / nicknameMap: クライアント側ニックネーム
* isAdmin ラベル

### Hana entrance

* useHanaEntrance で花の入り口 UI に切り替え
* hanaThemeColor / hanaThemeAltColor / hanaThemeWeakOpacity
* hanaModeIcon / hanaModeIconSize / hanaModeIconRadius / hanaModeBackground
* entranceShow* で表示要素を制御
* entranceMarginLeft でマージン調整

### サーバー統計の偽装

* enableCpuModel / customCpuModel
* enableCpuCore / customCpuCore
* enableMemTotal / customMemTotal
* enableFsTotal / customFsTotal

### DeepLX 無料モード

* deeplFreeMode / deeplFreeInstance (DeepLX-JS, 認証キー不要)

### ロール表示

* communityRole / community
* manageRole / assignedRole / assignableRole
* isRainbow

## タイムラインと UI

* hideLocalTimeLine / hideSocialTimeLine / hideGlobalTimeLine / hideLists / hideAntennas / hideChannel
* widgetDrawerDirection (left/right)
* textAreaAutoResize
* showInstanceTickerSoftwareName / showInstanceTickerVersion
* chooseFileFrom (OS ダイアログ vs Misskey ダイアログ)
* directRenote
* anonymizeMutedUsers
* noteVisibilityColoring
* reactionChecksMuting
* enableReactionConfirm / enableLikeConfirm

### 投稿フォーム

* postFormActions で下部アクションを並び替え
* defaultScheduledNoteDelete / defaultScheduledNoteDeleteTime

### 季節エフェクト

* enableSeasonalScreenEffect / hemisphere

## ウィジェット

* WidgetWeather (Open-Meteo)
* WidgetEarthQuake
* WidgetListenBrainz (userId)
* WidgetNestedWidget
* WidgetFederationJobQueue
* ネストウィジェット

## 地震情報

* Wolfx WebSocket API
* 有効化/強度閾値/TTS/通知スタイル/音/地域フィルタ/スロットル/ログ
* テスト通知

## ListenBrainz

* WidgetListenBrainz (userId)
* user/index.listenbrainz ページ

## 太鼓

* taiko ページ (iframe で cjdgrevival.com を埋め込み)
* games ページに bubble-game / reversi / taiko

## ドライブとアップロード

* マルチパートアップロード (create/upload-part/complete/abort)
* CleanExpiredMultipartUploads / CleanExpiredRemoteFiles / ReDownloadRemoteFile
* showOnlySensitiveFiles
* deleteWithFiles

## 連合と ActivityPub

* signed AP fetch
* access control
* quarantine
* delivery targets
* split remote cache / object storage remote prefix
* requireSignedApFetch

## サーバー管理

### テンプラ管理画面

* /admin/tempura-admin に集約
* ApprovalRequired / BlockMentions / LongIconUrl / UsernameMinLength / SecondsPerSignup / CustomSplashText / EmailDomainSettings / LlmModerationSettings / HanaEntranceSettings / EntranceSettings / DefaultFollowedUsers / BackgroundImages / CustomCursor / GeminiSettings / ContactFormSettings / LoginRiskSettings / ServerStatsSettings / SignedApFetchSettings / DeeplFreeModeSettings / ObjectStorageRemoteSettings / BlockedUserImageSettings

### インスタンス情報

* about-misskey-tempura ページ
* logo-tempura.svg / version / contributors / official & partner servers

### チェンジログ

* /tempura-changelog は HackMD を取得して解析

## 検索

* 高度な検索 (AND/OR/除外/日付範囲)
* copySearchUrl

## 互換性と注意

* HackMD 置き換え時の in-app changelog 問題
* 予約投稿は本家に導入済みのため除外
* ニックネームはクライアント側のみ

## バージョン

* 2026.10.0-tempura-2.0.21-dev

## 開発用 Storybook / Chromatic

* Storybook 10 用に旧addonとimportを移行。Misskeyテーマ切替は既存addonのMITライセンスを保持したローカル版へ移植。
* PRでは秘密情報を使わない静的Storybookビルドを検証し、成果物を短期保存する。Chromatic公開は別workflowで明示的に有効化する。
* ChromaticにはRepository secret `CHROMATIC_PROJECT_TOKEN` とVariables `CHROMATIC_ENABLED=true` / `CHROMATIC_APP_ID` が必要。トークンはチャットに貼らずGitHubへ直接登録する。
