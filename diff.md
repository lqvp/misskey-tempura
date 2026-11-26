<!--
執筆・更新規則: docs/contributing/feature-catalog.md
このコメントはアプリ内の表示・検索から除外されます。
-->

# Misskey-Tempura フォーク機能一覧

Misskey-Tempura は Misskey をフォークした実装です。本家 Misskey にはない、または異なる動作をする機能をまとめます。本家に既にある機能 (予約投稿など) はここでは扱いません。

注意事項

* アプリ内の /tempura-changelog は、稼働版に同梱したこのファイルを、ページを開いたときに取得して表示します。
* 一部の機能はロール権限やサーバー設定で有効化が必要です。
* 記載内容は、このファイルと同じコミットのコードに基づきます。アプリでは表示中のビルドのバージョンを自動表示します。

## 2026-11-25 の変更

### 管理画面

* コントロールパネル (`/admin`) → 設定 → 独自機能 (`/admin/tempura-admin`、管理者 `isAdmin` 専用) の 26 項目を 5 つの折りたたみカテゴリ (登録・参加制御 / 連合・アクセス制御 / モデレーション・セキュリティ / LLM・外部連携 / 見た目・エントランス) に整理し、管理画面のアプリ内検索に対応しました。
  * 検索から項目を選ぶと該当カテゴリを自動で展開します。ページタイトルとアイコンはサイドバーと同じ「独自機能」に統一しました。
  * 管理者権限のないモデレーターのサイドバーには表示せず、管理画面の検索結果からも `/admin/tempura-admin` 配下を除外します。
  * スマートフォン向けのフォルダーページ表示が有効でも、5 カテゴリはインラインで開閉し、フォームの入力状態を維持します。

### TLダイジェスト

* 不在中のホームタイムライン (HTL) を参照ノートリンク付きのトピック抽出型 (プロンプトで最大 5 件を要求し、表示上限は 8 件) で要約するウィジェット「TLダイジェスト」(`WidgetTlDigest`) を追加しました。ウィジェット編集またはネストウィジェット内から追加でき、ログイン済みかつ LLM 設定済みで利用できます。サーバー提供 LLM は管理者による有効化とロール権限 `canUseGeminiLLMAPI` が必要 (1 時間 30 回・最小間隔 10 秒) で、ユーザー直指定の OpenAI 互換 API でも利用できます。
  * 不在復帰時はポップアップや通知タブを使わず、ウィジェット内の小さなドットと 1 行表示で知らせ、既定では「まとめる」を押したときだけ LLM API を呼び出します。通常時も「直近を要約」で直近 24 時間から要約でき、ネストウィジェット内でも切り替え中に生成処理と結果を維持します。
  * ウィジェット設定の歯車ボタンで不在判定間隔 (30 分 / 1 時間 / 3 時間 / 6 時間)・最大件数 (50 / 100 / 200 件)・リノートを含める・不在復帰時の自動生成を設定できます。
  * 離席期間の遡及は最大 24 時間、1 回の走査上限は 500 ノート (件数表示上限 200 件) です。要約結果と件数キャッシュはメモリ上のみ保持してリロードで破棄し、ブラウザには離席検出用の状態と自動生成の重複送信を防ぐための送信済み期間のみ保持します。JSON として解析できない応答はプレーンテキスト表示にフォールバックし、空応答や `topics` の形式不正はエラーとして扱います。
* 設定 → 独自機能 → AIと通知 → LLM設定 → TLダイジェスト (`/settings/tempura-settings`) に TLダイジェストの詳細設定を追加しました。公開範囲 (`tlDigestVisibilities`、アカウント別、既定はパブリック・ホーム)、CW 付き投稿の扱い (`tlDigestCwMode`、既定は注記のみ送信し無言 CW はスキップ。ほかに除外 / 本文も含めて送信)、ユーザー単位の絞り込み (`tlDigestUserFilterMode`・`tlDigestUserFilterUserIds`、アカウント別、最大 100 人・自分自身は選択不可)、追加指示 (`tlDigestPrompt`) を設定できます。
  * 指名/ダイレクト・ローカル限定・自分の投稿やリノート・ソフト/ハード両方のワードミュート・センシティブ添付キャプションは常に除外します。
  * フォロワー限定投稿を有効にするときは送信先を確認するダイアログを表示し、同意済みの送信先をアカウント単位で 1 つ保存します。直指定 URL やサーバー提供 LLM の接続先 (`serverOpenAIDestinationId`) が変わると、再確認するまでフォロワー限定投稿は送信しません。生成準備中やリトライ待機中に関連設定やワードミュートが変更された場合は送信を中止します。
  * ユーザー単位の絞り込みでは、純リノートをリノートした人と元投稿の作者の両方で判定します。「指定したユーザーだけを対象にする」で 0 人のときは安全側 (fail-close) で要約対象を 0 件とし、走査も LLM 呼び出しもしません。
* TLダイジェストのユーザー単位絞り込み UI を改善しました。絞り込みモードをアイコン付きラジオボタンに変更し、対象ユーザー欄を件数表示 (`N/100`)・追加ボタン (上限 100 人到達時は無効化)・空状態付きのパネルに整理しました。
  * 選択済みユーザーはミニカードで表示し、ミュートしたユーザーの匿名化設定 (`anonymizeMutedUsers`) が有効でも、この管理一覧では本人を識別できます。削除や凍結などで取得できないユーザーも ID 表示から削除できます。

### LLM 連携

* ユーザー直指定モードの OpenAI 互換 API 呼び出しで、一時的な失敗 (408 / 425 / 429 / 500 / 502 / 503 / 504・ネットワーク断) を指数バックオフとジッターで自動再試行するようにしました (最大 3 回試行、初回とリトライ最大 2 回)。
  * `POST /chat/completions` は全体 120 秒の予算 (2xx 後の本文転送失敗は二重課金防止のため再送しません)、`GET /models` は全体 30 秒の予算です。サーバー提供モード (`notes/llm-gen` / `notes/llm-models`) はクライアント側自動リトライの対象外です。
  * `Retry-After` (秒数 / IMF-fixdate 形式の HTTP-date) をそのまま尊重し、予算に収まらない場合は早めに失敗します。各試行前に送信先と同意を再確認し、呼び出し元の中断を常に優先します。
* サーバー提供 LLM (`notes/llm-gen`) の上流 OpenAI 互換 API タイムアウトを 30 秒から 120 秒へ延長しました (画像付き送信が 400 / 422 で拒否されたときの本文のみ再送は独立した 60 秒のタイムアウト)。
* `/api/meta` にサーバー提供 LLM の接続先識別子 `serverOpenAIDestinationId` (サーバー固有の非公開鍵による HMAC-SHA256 先頭 16 文字) を追加しました。公開 API (`/api/meta`) には接続先 URL を出さず、非公開鍵 (`serverOpenAIDestinationKey`) は API やモデレーションログに出しません。

### UI とアクセシビリティ

* ラジオボタン部品 (`MkRadios`) をネイティブのラジオボタン入力とラベル紐付けに改め、選択状態と表示名が支援技術に伝わるようにしました。

## 2026-11-24 の変更

### フロントエンド

* 画像表示に使うメディアプロキシの URL を、このブラウザ単位で指定できるようにしました。設定 → 独自機能 → 動作 から設定でき、サーバーが返すプロキシ済み URL もクライアント側で差し替えます。

### バックエンド・セキュリティ

* 投票付きノートの投票更新 (`Update`) の ActivityPub 配送で、ノートの公開範囲と配送先制御 (`deliveryTargets`) を尊重するよう修正しました。
  * ダイレクト (`specified`) は閲覧許可ユーザー (`visibleUserIds`) のリモート宛先のみへ配送し、フォロワー・リレー・非公開化前に残ったメンション先には送りません。
  * リレー配送は公開 (`public`) とセミパブリック (`public_non_ltl`) のみとし、`deliveryTargets` を反映します。
* ActivityPub の GET / POST リクエストでリダイレクトを手動追従し、転送先ごとに HTTP Signature を再署名するようにしました (最大 5 回、リダイレクト全体で合計 5 秒のタイムアウトを共有。POST の 303 See Other は GET へ切替)。
* リモート投稿受信時の解決上限を宛先 (`to` / `cc`)・メンション各最大 100 人、添付最大 16 件に制限しました。あわせてリモートカスタム絵文字のアイコン URL を検証し、不適合な URL を除外します (本番環境では `https://` のみ許可)。
* OAuth2 の認可トランザクションと認可コードのインメモリキャッシュ (有効期限 5 分) に、各最大 1000 件の LRU 上限を追加しました。
* WebAuthn 登録チャレンジの検証で Redis の `GETDEL` による原子的消費を使い、並列リクエストでの再利用を防止しました。

## 2026-11-23 の変更

### モデレーションと権限

* サブモデレーター (`Moderator`) の権限判定を `MainModerator` 以上 (`isModerator`) から分離し、UI 表示用の `isSubModerator` を新設しました。他人のノート・ファイル・ページ削除や私信閲覧、不審なログインの記録 (`admin/login-risk/user-footprints`) の参照、アバター/バナー解除などがサブモデレーターに広がらないようにしつつ、コントロールパネルとユーザー管理画面へのアクセスを維持します。
* 通報対象の確認に支障が出ないよう、サブモデレーターも `users/show` で凍結済みユーザーを参照できるようにし、ユーザーメニューから「モデレーション」を開けるようにしました。あわせてログインリスク判定でサブモデレーターも特権アカウントとして評価します。
* 管理者ロールが公開されている管理者プロフィールでは、非管理者 (モデレーター・サブモデレーター含む) にユーザーメニューの「モデレーション」リンクを表示しないようにしました。直接開いた場合も `admin/show-user` が `ACCESS_DENIED` を返し、画面に権限エラーを表示します。

### バックエンド・アンテナ・LLM

* バックエンドのチャート (連合・ノート・ユーザーなど全 12 チャート共通基盤) で、DB 書き込み待ちの更新をグループ単位に即時集約するようにしました。20 分おきの保存まで配列に積み上げず、メモリ消費を抑えます。
* リストアンテナではリスト所属ユーザーの絞り込みを SQL 側で適用するようにしました。新着取得 (`sinceId` または `sinceDate` のみ指定) は古い順に最大 1000 件を走査し、不足時のみ新しい側から残り最大 1000 件を走査して、1 回の総走査上限を 2000 件に保ちつつ取りこぼしと停滞を防ぎます。
* サーバー提供 LLM (`notes/llm-gen`) で画像を添付して送信した際に HTTP 400 または 422 で拒否された場合、本文のみで 1 回自動再送するようにしました。

### 設定・オフラインページ

* コントロールパネル (設定 → 独自機能 → 見た目・エントランス → オフラインページの設定) で保存した直後に稼働中の Service Worker へ新しい設定を即時同期し、再読み込み前でも最新のメッセージや問い合わせ先 URL が反映されるようにしました。
* 固定招待コード (`fixedInviteCode`) の保存時に前後の空白を除去するようにしました (空白のみは無効扱い)。

## 2026-11-22 の変更

### フロントエンドの軽量化と修正

* 長時間の利用でメモリが増え続けないよう、タイムラインから外れたノートのアンテナ一致情報を解放し、アクティビティウィジェットのチャートを破棄する処理を修正しました。
* カスタム通知音のデコード済みキャッシュを最大 16 MiB に制限しました。同梱の通知音は別に保持するため、この上限の影響を受けません。
* リアクション数だけが増えた場合は表示可否の判定を再利用し、ミュート・ブロックの変更時には判定を更新します。
* ポップアップを項目ごとに描画する構成にし、ほかのポップアップの更新による再描画を抑えました。
* アップロード時の画像・動画処理を必要になった時点で読み込みます。タイムラインの遅延読み込みは起動時のリクエスト増加を避けるため取り消しました。
* チャートの日付処理を軽量化し、ズーム・行列チャート用プラグインを必要なチャートだけで読み込むようにしました。
* 独自機能一覧にカテゴリ別ナビゲーションと全文検索を追加しました。表示内容を diff.md に一本化し、JavaScript へ本文を埋め込まず、同梱の静的ファイルとして読み込みます。

### バックエンドの起動処理

* API の入力検証器は、各エンドポイントが初めて呼ばれた時点でコンパイルし、以降は再利用します。
* API ルートの登録を GET / POST に限定し、暗黙の HEAD ルートも無効にしました。
* メール送信・WebAuthn・ダウンロード・S3 操作などの依存ライブラリを、各処理が必要になった時点で読み込むようにしました。

### リリースと CI

* master へ取り込む前にリリース PR を作成し、CI の完了を待つようにしました。
* リリース PR の再利用時とマージ前に先端コミットを再確認し、ベータタグの参照先を修正しました。
* CI 待機では各チェックの最新実行だけを判定し、チェック情報はコマンド引数ではなくファイル経由で渡します。

## 2026-11-20 の変更

### 検索

* ノート検索の日時範囲フィルタを標準の「投稿日時from / 投稿日時to」に一本化し、高度な検索内に重複していた「開始日時 / 終了日時」欄を削除しました。あわせて、指定した日時範囲が検索 API リクエストに送信されない不具合と、検索 URL をコピーして開いたときに高度な検索オプション (公開範囲・添付/CW/返信/投票・AND/OR・除外語・日時範囲・高度な構文) が復元されない不具合を修正しました。

### 通知

* 管理者から送信するモデレーション通知 (`admin/send-notification`) とシステム通知 (新規ユーザー作成・リモートファイルクリーンアップ完了・絵文字インポートの重複スキップ・アカウント整理完了) のアイコンにサーバーアイコンを表示するようにしました。

## 2026-11-19 の変更

### フロントエンド

* ユーザー設定の「独自機能」画面 (`/settings/tempura-settings`) のレイアウトを本家設定画面と統一しました。項目を 4 グループ (プライバシーとプロフィール / 見た目とタイムライン / 投稿とノート / AIと通知) と小見出しに整理し、地震速報の階層を簡素化したほか、空だったドライブ欄を削除しました。また、LLM設定・地震速報の保存ボタンを廃止し、再読み込みが必要な「地震速報を有効にする」を切り替えたときだけ案内を表示します。

## 2026-11-18 の変更

### フロントエンド

* FxTwitter 埋め込み動画の再生本体 (`video` / `source` 要素とライトボックス再生) にも `referrerpolicy="no-referrer"` を付与し、HTTP 351 での再生失敗を修正しました。

## 本家との大きな違い

* ログインリスク判定と確認コード
* フォロー履歴とフォローリクエスト履歴
* 引用ミュートとアバター装飾ミュート
* セミパブリック (public_non_ltl) と受信指定ノート
* 配送先制御 (delivery targets)
* アカウント整理 (truncate)
* ノートの非公開化 (make private)
* LLM モデレーションと LLM 連携 (OpenAI 互換)
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
* TLダイジェストウィジェット (不在中のホームタイムライン要約)
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
* サブモデレーター (`Moderator`) も特権アカウントとしてリスク評価の対象になります

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

### ActivityPub 通信・受信と認証の保護

* ActivityPub の GET / POST リクエストではリダイレクトを手動追従し、転送先ごとに HTTP Signature を再署名します (最大 5 回、リダイレクト全体で合計 5 秒のタイムアウトを共有。POST の 303 See Other は GET へ切替)
* リモート投稿受信時の解決上限を宛先 (`to` / `cc`)・メンション各最大 100 人、添付最大 16 件に制限し、リモートカスタム絵文字のアイコン URL を検証して不適合な URL を除外します (本番環境では `https://` のみ許可)
* OAuth2 の認可トランザクションと認可コードのインメモリキャッシュ (有効期限 5 分) に、各最大 1000 件の LRU 上限を設けています
* WebAuthn 登録チャレンジの検証では Redis の `GETDEL` による原子的消費を使い、並列リクエストでの再利用を防ぎます

### 匿名アクセスへの非公開設定の一貫適用

* 未ログインの Web アクセスと署名なしの ActivityPub 取得を「匿名アクセス」として扱い、ノートの公開判定を共有述語 (misc/visitor-note-visibility.ts) に共通化しました
* SSR/OGP・埋め込み (/embed/notes/:id)・ActivityPub の /notes/:id・/notes/:id/activity・outbox で、requireSigninToViewContents・hidePublicNotes/hideHomeNotes・時限設定 (makeNotesHiddenBefore/makeNotesFollowersOnlyBefore)・localOnly・ugcVisibilityForVisitor を反映します
* 署名が無い・検証できない取得は匿名に分類します。署名者の鍵をまだ知らない場合は、インスタンス登録済みのホストに限りアカウントを取りに行って検証します (署名必須モードと同じ方針)。未登録ホストの署名者は匿名に分類します
* 署名を検証できたリモートサーバーからの取得と、配送済みのコピーは対象外です
* API でも Pages (pages/show, pages/featured)・Clips (clips/show, clips/notes)・Channels (channels/show, channels/featured)・ユーザー検索 (users/search) に同じポリシーを適用します。ugcVisibilityForVisitor が 'none' の間は匿名には返さず、'local' の間は匿名のユーザー検索をローカルユーザーに限定します (users/show と同じ扱い)
* 統計・チャート・連合・ノート一覧系のエンドポイント (replies / renotes / quotes / reactions / featured / local-timeline など) は未ログインユーザーに既定で空の応答を返します。管理画面の「匿名アクセスの公開設定」(独自機能) でエンドポイントごとに公開できます (リアクション一覧 /api/notes/reactions を含む)

### 招待と承認

* approvalRequiredForSignup でサインアップ承認制を有効化できます
* defaultRequireSigninToViewContents で新規アカウントの「コンテンツの表示にログインを必須にする」既定値を設定できます
* 承認待ちユーザー一覧 (/admin/approvals) で承認/拒否できます
* 承認拒否時には通知が送られます
* 招待コード (invite) でメール認証や承認をスキップできます (ロール権限 canSkipInviteEmailAuth / canSkipInviteApproval が必要)
* 招待コードの有効期限を設定できます
* 固定招待コード (`fixedInviteCode`) を設定できます。回数制限なく使い放題で消費もされない、任意の文字列の招待コードです (コントロールパネル → 設定 → 独自機能 → 登録・参加制御)
  * 保存時に前後の空白を除去します (空白のみは無効扱いです)
* 合言葉 (signupPassphrase) を設定できます。登録画面の招待コード入力欄に入力すると登録できます。全角半角・大文字小文字・空白の違いは無視されます (独自機能設定画面)

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
* canPublicNonLtlNote が無効な場合、canHomeNote が有効なら home、無効なら followers に降格します

### 受信指定ノート

* receiveSpecifiedNotesFrom で、DM 的なノートを誰から受信するか (all / following / nobody) を選べます
* 返信相手と管理者/モデレーターは常に受信できます

### アウトボックスと Web フィード

* outboxFilter でアウトボックスに含める公開範囲 (public / public_non_ltl / home) を選びます
* webFeedFilter で RSS/Atom/JSON フィードを無効化できます

### 配送先制御

* ノート投稿時に配送先サーバーを include / exclude で指定できます
* フォロワー一覧のサーバーから選択します
* 投票付きノートの投票更新 (`Update`) の ActivityPub 配送でも、ノートの公開範囲と配送先制御 (`deliveryTargets`) を尊重します
  * ダイレクト (`specified`) は閲覧許可ユーザー (`visibleUserIds`) のリモート宛先のみへ配送し、フォロワー・リレー・非公開化前に残ったメンション先には送りません
  * リレー配送は公開 (`public`) とセミパブリック (`public_non_ltl`) のみとし、`deliveryTargets` を反映します

### すぐ消す (scheduledNoteDelete)

* ノート投稿時に自動削除時刻を設定できます
* defaultScheduledNoteDelete / defaultScheduledNoteDeleteTime でデフォルトを設定できます
* 1 年以上先には設定できません
* 削除の代わりに非公開化する選択 (makePrivateInsteadOfDelete) があります
* 非公開化 (makePrivateInsteadOfDelete) にはロールポリシー canUseMakePrivate が必要です
* 削除時に他のノートから参照されている添付ファイルは、そのノートのために残ります

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

## アンテナ

### キーワードのマッチ方式 (keywordMode)

* アンテナごとに「通常 (文字列として一致)」と「正規表現」を選べます。既存のアンテナはマイグレーションで通常モードになり、動作は変わりません。
* 正規表現モードでは、登録した各項目が 1 つの正規表現全体として評価されます。改行・空白・`|` では分割されません (チップ 1 つ = 式 1 つ)。
* 通常キーワード・除外キーワード・強制除外キーワードのすべてに同じモードが適用されます。
* マッチャは RE2 (単語ミュートと同じ依存) なので、後読みなどの RE2 非対応構文は構文エラーとして検出されます。式が壊れたまま受信を止めることはありません。
* 上限は 1 アンテナあたり 32 グループ・グループあたり 32 項目・1 項目 512 文字です。上限はマッチ方式に関係なく適用されます。
  * 新規作成では上限を超えると保存できません。
  * 従来の API では上限を超えるアンテナを保存できていたため、既存の超過アンテナは「超過が増えない限り」保存できます (名前だけの変更も可能)。超過を増やす変更だけが拒否されます。
* パターンはノート本文 (+ CW) に対する部分一致です。`^` / `$` は本文全体の先頭・末尾に効くため、CW 付きのノートでは `^りんご$` のような式は一致しません。行単位で絞りたい場合は `(?m)` を使ってください。
* 強制除外キーワードは高度なスコアリング (SCORE) 有効時のみ使われるため、無効時は検証されません。
* マッチ方式を切り替えても既存キーワードは自動変換・自動保存されません。エディタは未保存の切り替えに警告を表示します。
* エクスポート/インポートでもモードが保持されます。旧形式のエクスポート (モードなし) は通常モードとして復元されます。正規表現として解釈できないアンテナはインポート時にスキップされ、件数がサーバーログに記録されます (ユーザーへの通知はありません)。

### タイムラインの範囲

* アンテナのタイムラインは「アンテナが受信したノートの履歴」ではなく「現在の条件に一致するノート」を返します。そのため、アンテナを作る前や条件を変更する前のノートでも、現在の条件に合えば並びます。補完するのは直近 30 日以内のノートで、1 回の読み込みで走査するのは最大 2000 件です。
* リストアンテナではリスト所属ユーザーの絞り込みを SQL 側で適用します。新着取得 (`sinceId` または `sinceDate` のみ指定) は古い順に最大 1000 件を走査し、不足時のみ新しい側から残り最大 1000 件を走査して、1 回の総走査上限を 2000 件に保ちつつ取りこぼしと停滞を防ぎます。
* 保存前の試し打ち (antennas/test) とアンテナのタイムラインは同じ条件で判定するため、条件の解釈は一致します。ただし試し打ちは直近 200 件を走査して最大 30 件を返すのに対し、タイムラインの方が広い範囲を対象にします。そのため試し打ちに出ないノートがタイムラインに出ることはあります。逆に、タイムラインで外したノート (antennas/remove-note) は試し打ちには残ります。
* アンテナのタイムラインからノートを外すと (antennas/remove-note)、そのノートは再表示されません。外した記録は 30 日間保持され、1 アンテナあたり 1000 件を超えると古い記録から消えます (その場合、外したノートが再表示されうる)。
* この変更より前のバージョンでノートを外した場合、外した記録が残っていないため、条件に合っていればタイムラインに再表示されます。必要なら外し直してください。
* 条件を変更すると、以前の条件で受信したノートも現在の条件で再判定されます。ソーシャルグラフ (フォロワー限定など) を条件にしている場合、フォロー関係が変わると過去のノートが表示されなくなることがあります。

### 保存・インポートの検証

* 受信元が「リスト」のアンテナは、リストを指定しないと作成・保存できません (NO_SUCH_USER_LIST)。以前はリストなしで保存できましたが、その場合は何も受信しないアンテナになっていました。
* 更新時は、受信元が「リスト」でないアンテナでも、指定されたリストが自分のものでなければ同じエラーになります (以前はリスト指定が無視されて保存できました)。
* この変更より前に作られた「リストなしのリスト アンテナ」は自動では直りません。アンテナの設定を開いて受信元を「全て」などに変えて保存し直すか、リストを選び直してください。名前だけの変更でも保存時にエラーになるため、まず受信元を直してください。
* インポートでは、作成と同じ条件で検証します。
  * キーワードか除外キーワードのどちらかが入っていればインポートできます (キーワードなし・除外キーワードのみのアンテナも対象)。
  * キーワードの上限 (32 グループ・グループあたり 32 項目・1 項目 512 文字) は、マッチ方式が「通常」のアンテナにも適用されます。超過したアンテナはインポートされず、サーバーログに記録されます。
  * 強制除外キーワードはスコアリング (SCORE) 有効時のみ検証されます。
  * 受信元が「リスト」のアンテナは、インポート時に「ユーザー指定」として復元されます (リストの中身はユーザー一覧に変換されます)。

## フォローと履歴

### フォロー履歴

* follow / unFollow / wasFollow / wasUnFollow / blocked / unBlocked / wasBlocked / wasUnBlocked を記録します
* フィルタと全削除ができます
* canReadFollowHistory 権限が必要です
* 365 日より古い記録は日次のクリーンアップジョブ (毎日 4:30) で自動削除されます

### フォローリクエスト履歴

* sent / received / approved / rejected / wasApproved / wasRejected / wasBlocked / wasUnBlocked を記録します
* フィルタと全削除ができます
* 365 日より古い記録は日次のクリーンアップジョブ (毎日 4:30) で自動削除されます

### フォロー制御

* autoFollowBack: フォロー返しを自動化 (ロール権限 canAutoFollowBack)
* autoFollowOnMove: 移動時の自動フォロー
* defaultFollowedUsers: 新規ユーザーが自動フォローするユーザー
* forciblyFollowedUsers: 解除/ミュート/ブロックできない強制フォロー
* carefulBot: Bot フォローに承認要求
* autoRejectFollowRequest: フォロー済み以外を自動拒否

### プロキシアカウントのフォロー条件

* リストに追加されたリモートユーザーやアカウント移行先をプロキシアカウントがフォローする条件を、サーバー設定の proxyAccountFollowMode で切り替えられます (管理画面 → 独自機能 → フォロー条件)
  * always: 常にフォローする (本家と同じ動作)
  * skipIfFollowed: このインスタンス内にフォロワーがいない場合のみフォローする (初期値。リストへの追加は従来の tempura の動作。アカウント移行では従来は常にフォローしていたため、ローカルフォロワーがいる移行先への新規フォローは作成されなくなります)
  * disabled: 新たにはフォローしない。既存のフォローは解除されず、購読中の投稿は届き続けます

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

* permissionGroup: Moderator (サブモデレーター) 階級を追加。ロール編集画面の「ロールの権限」で選択できる。通報処理 (abuse-user-reports / update-abuse-user-report / resolve-abuse-user-report / forward-abuse-user-report) とユーザー情報参照 (show-user / show-users)、モデレーションノート (update-user-note) はサブモデレーターでも利用可能。管理操作 (requireModerator / requireAdmin のエンドポイント) は引き続き MainModerator / Admin ロールが必要
  * サブモデレーター (`Moderator`) の権限判定は `MainModerator` 以上 (`isModerator`) から分離しており、UI 表示用に `isSubModerator` を用います。他人のノート・ファイル・ページ削除や私信閲覧、不審なログインの記録 (`admin/login-risk/user-footprints`) の参照、アバター/バナー解除などはサブモデレーターには広がらず、コントロールパネルとユーザー管理画面へのアクセスを維持します
  * 通報対象の確認のため、サブモデレーターも `users/show` で凍結済みユーザーを参照でき、ユーザーメニューから「モデレーション」を開けます
* 管理者ロールが公開されている管理者プロフィールでは、非管理者 (モデレーター・サブモデレーター含む) にユーザーメニューの「モデレーション」リンクを表示せず、直接開いた場合も `admin/show-user` が `ACCESS_DENIED` を返して画面に権限エラーを表示します
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

### サーバー OpenAI 互換

注意: このバージョンでサーバー Gemini 設定 (serverGemini*) は廃止されました。
マイグレーションが既存の Gemini API キーを OpenAI 互換設定へ引き継ぎます
(baseURL は Gemini の OpenAI 互換エンドポイント)。Gemini を利用していなかった
サーバーは、コントロールパネル (設定 → 独自機能 → LLM・外部連携 → LLM設定) で OpenAI 互換 API キーとベースURLを
再設定してください。旧 Gemini 用ユーザートークン (geminiToken) も削除されたため、
各自で openaiToken を設定し直す必要があります。

* serverOpenAIEnabled / apiKey / baseURL / models
* OpenAI 互換 API (Chat Completions) をサーバー経由で利用可能
* useGeminiLLMAPI でユーザーがサーバー提供LLMを利用
* useGeminiWithMedia でメディア付き (image_url)
* system prompt と note/profile summarize prompts
* ノート変換 (long/short/simple/casual/professional/cat/custom)
* notesLimitPrompt / includeFollowersNotesPrompt
* ユーザー直指定モード: openaiToken / openaiBaseUrl / openaiModel
* モデル一覧を API から動的取得 (notes/llm-models、GET /models)
* モデルの画像入力対応をプロバイダのモダリティ情報から判定 (OpenRouter / Mistral / DeepSeek 等、情報が無い場合はモデル名推測)
* ユーザーのUI言語での応答を促すヒントをシステムプロンプトに付与
* 画像入力対応とみなす設定 (openaiForceImageInput) を追加
* 旧ユーザー設定 geminiModel / geminiThinkingBudget は廃止 (geminiToken と合わせて再設定が必要)
* プロンプトインジェクション対策 (user_content デリミタとガード指示)
* 返信文脈を参考データとして要約に付与
* temperature 設定 (ユーザー直指定モード)
* サーバー提供 LLM (`notes/llm-gen`) の上流 OpenAI 互換 API タイムアウトは 120 秒です。画像を添付して送信した際に HTTP 400 または 422 で拒否された場合は、本文のみで 1 回自動再送します (本文のみ再送は独立した 60 秒のタイムアウト)
* `/api/meta` にサーバー提供 LLM の接続先識別子 `serverOpenAIDestinationId` (サーバー固有の非公開鍵による HMAC-SHA256 先頭 16 文字) を含めます。公開 API (`/api/meta`) には接続先 URL を出さず、非公開鍵 (`serverOpenAIDestinationKey`) は API やモデレーションログに出しません
* WidgetTlDigest (TLダイジェスト): 不在中のホームタイムライン (HTL) を参照ノートリンク付きのトピック抽出型 (プロンプトで最大 5 件を要求し、表示上限は 8 件) で要約するウィジェットです。詳細設定は 設定 → 独自機能 → AIと通知 → LLM設定 → TLダイジェスト (`/settings/tempura-settings`) にあります (使い方や走査・保持の制約は「ウィジェット」を参照)
  * 利用条件はログイン済みかつ LLM 設定済みです (サーバー提供 LLM は管理者による有効化とロール権限 `canUseGeminiLLMAPI` が必要で、1 時間 30 回・最小間隔 10 秒、またはユーザー直指定の OpenAI 互換 API)
  * 公開範囲 (`tlDigestVisibilities`、アカウント別、既定はパブリック・ホーム) では、指名/ダイレクト・ローカル限定・自分の投稿やリノート・ソフト/ハード両方のワードミュート・センシティブ添付キャプションを常に除外します。フォロワー限定投稿を有効にするときは送信先を確認するダイアログを表示し、同意済みの送信先をアカウント単位で 1 つ保存します。直指定 URL やサーバー提供 LLM の接続先 (`serverOpenAIDestinationId`) が変わると、再確認するまでフォロワー限定投稿は送信しません
  * CW 付き投稿の扱い (`tlDigestCwMode`、既定は注記のみ送信し無言 CW はスキップ。ほかに除外 / 本文も含めて送信) と追加指示 (`tlDigestPrompt`) を設定できます。生成準備中やリトライ待機中に関連設定やワードミュートが変更された場合は送信を中止します
* WidgetTlDigest のユーザー単位絞り込み (`tlDigestUserFilterMode`・`tlDigestUserFilterUserIds`、アカウント別、最大 100 人・自分自身は選択不可): アイコン付きラジオボタンで「絞り込まない / 指定したユーザーを除外する / 指定したユーザーだけを対象にする」を選べます。純リノートはリノートした人と元投稿の作者の両方で判定し、「指定したユーザーだけを対象にする」で 0 人のときは安全側 (fail-close) で要約対象を 0 件とし、走査も LLM 呼び出しもしません
  * 対象ユーザー欄は件数表示 (`N/100`)・追加ボタン (上限 100 人到達時は無効化)・空状態付きのパネルに整理しており、選択済みユーザーをミニカードで表示します。ミュートしたユーザーの匿名化設定 (`anonymizeMutedUsers`) が有効でも、この管理一覧では本人を識別でき、削除や凍結などで取得できないユーザーも ID 表示から削除できます
* ユーザー直指定モードの OpenAI 互換 API 呼び出しでは、一時的な失敗 (408 / 425 / 429 / 500 / 502 / 503 / 504・ネットワーク断) を指数バックオフとジッターで自動再試行します (最大 3 回試行、初回とリトライ最大 2 回)
  * `POST /chat/completions` は全体 120 秒の予算 (2xx 後の本文転送失敗は二重課金防止のため再送しません)、`GET /models` は全体 30 秒の予算です。サーバー提供モード (`notes/llm-gen` / `notes/llm-models`) はクライアント側自動リトライの対象外です
  * `Retry-After` (秒数 / IMF-fixdate 形式の HTTP-date) をそのまま尊重し、予算に収まらない場合は早めに失敗します。各試行前に送信先と同意を再確認し、呼び出し元の中断を常に優先します

### LLM モデレーション

* 上記参照

## 通知

* unfollow / followRequestRejected / blocked / unblocked / loginFailed / llmModerationQueue / receivedContactForm / roleAssigned
* newNotes / notedBySomeUsers / renoteedBySomeUsers (grouped)
* メール通知 (unfollow/blocked/unblocked)
* loginDescription に IP を含む
* 管理者から送信するモデレーション通知 (`admin/send-notification`) とシステム通知 (新規ユーザー作成・リモートファイルクリーンアップ完了・絵文字インポートの重複スキップ・アカウント整理完了) のアイコンにサーバーアイコンを表示します

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
* mediaProxy: 設定 → 独自機能 → 動作 (`/settings/tempura-settings`) から、このブラウザで画像表示に使うメディアプロキシ URL を指定できます (misskey-dev/media-proxy 互換)
  * サーバーが返すプロキシ済み URL (アバター・URLプレビュー・リモートメディアなど) を差し替えます
  * もともとプロキシされていない自サーバーの URL (ローカルの `/files/` など) は通常表示ではそのままです。アバターのデータセーバー表示と、アニメーション画像の静止画表示では設定したプロキシを経由するため、メンションの `/avatar/@user@host` はサーバーの 302 をたどれるプロキシが必要です
  * 自サーバーのルート URL と `/proxy` 配下、https ページでの http プロキシ指定は入力時に拒否します
  * 外部から到達できないサーバー (プライベートIP・LAN 内など) で外部プロキシを指定すると、アバターなどプロキシ経由の画像が表示されません。その場合はこの設定を空欄に戻してください
* 独自機能設定画面 (`/settings/tempura-settings`): 設定 → 独自機能 の項目を本家設定画面と同じレイアウトで 4 グループ (プライバシーとプロフィール / 見た目とタイムライン / 投稿とノート / AIと通知) と小見出しに整理しています
  * LLM設定・地震速報の保存ボタンはなく、再読み込みが必要な「地震速報を有効にする」を切り替えたときだけ案内を表示します

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
* WidgetTlDigest (TLダイジェスト): 不在中のホームタイムライン (HTL) を参照ノートリンク付きのトピック抽出型 (プロンプトで最大 5 件を要求し、表示上限は 8 件) で要約します。ウィジェット編集またはネストウィジェット内から追加できます
  * ログイン済みかつ LLM 設定済みで利用できます。サーバー提供 LLM は管理者による有効化とロール権限 `canUseGeminiLLMAPI` が必要 (1 時間 30 回・最小間隔 10 秒) で、ユーザー直指定の OpenAI 互換 API でも利用できます
  * 不在復帰時はポップアップや通知タブを使わず、ウィジェット内の小さなドットと 1 行表示で知らせ、既定では「まとめる」を押したときだけ LLM API を呼び出します。通常時も「直近を要約」で直近 24 時間から要約でき、ネストウィジェット内でも切り替え中に生成処理と結果を維持します
  * ウィジェット設定の歯車ボタンで不在判定間隔 (30 分 / 1 時間 / 3 時間 / 6 時間)・最大件数 (50 / 100 / 200 件)・リノートを含める・不在復帰時の自動生成を設定できます。公開範囲・CW・ユーザー絞り込みなどの詳細設定は 設定 → 独自機能 → AIと通知 → LLM設定 → TLダイジェスト (`/settings/tempura-settings`) にあります
  * 離席期間の遡及は最大 24 時間、1 回の走査上限は 500 ノート (件数表示上限 200 件) です。要約結果と件数キャッシュはメモリ上のみ保持してリロードで破棄し、ブラウザには離席検出用の状態と自動生成の重複送信を防ぐための送信済み期間のみ保持します。JSON として解析できない応答はプレーンテキスト表示にフォールバックし、空応答や `topics` の形式不正はエラーとして扱います
* ネストウィジェット

## 地震情報

* Wolfx WebSocket API
* 有効化/強度閾値/TTS/通知スタイル/音/地域フィルタ/スロットル/ログ
* テスト通知

## ListenBrainz

* WidgetListenBrainz (userId)
* user/index.listenbrainz ページ
* 外部 API の origin_url は http(s) のみリンク化します

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

* コントロールパネル (`/admin`) → 設定 → 独自機能 (`/admin/tempura-admin`、管理者 `isAdmin` 専用) に 26 項目を集約し、5 つの折りたたみカテゴリ (登録・参加制御 / 連合・アクセス制御 / モデレーション・セキュリティ / LLM・外部連携 / 見た目・エントランス) に整理しています
  * 管理画面のアプリ内検索に対応し、検索から選ぶと該当カテゴリを自動で展開します。ページタイトルとアイコンはサイドバーと同じ「独自機能」に統一しています
  * 管理者権限のないモデレーターのサイドバーには表示せず、管理画面の検索結果からも `/admin/tempura-admin` 配下を除外します
  * スマートフォン向けのフォルダーページ表示が有効でも、5 カテゴリはインラインで開閉し、フォームの入力状態を維持します
* ApprovalRequired / DefaultRequireSigninToViewContents / BlockMentions / LongIconUrl / UsernameMinLength / SecondsPerSignup / SignupCodesSettings / CustomSplashText / EmailDomainSettings / LlmModerationSettings / HanaEntranceSettings / EntranceSettings / DefaultFollowedUsers / ProxyAccountFollowModeSettings / BackgroundImages / CustomCursor / GeminiSettings / ContactFormSettings / LoginRiskSettings / ServerStatsSettings / SignedApFetchSettings / AnonymousAccessSettings / DeeplFreeModeSettings / ObjectStorageRemoteSettings / BlockedUserImageSettings / OfflinePageSettings

### オフラインページ

* サーバーに接続できないとき Service Worker がエラー種別 (オフラインかサーバーエラーか) を表示するページを返す。自動再試行つき
* offlinePageConfig: オフラインページのカスタムメッセージ・問い合わせ先 URL をコントロールパネル (設定 → 独自機能 → 見た目・エントランス → オフラインページの設定) で設定できます
  * 保存した直後に稼働中の Service Worker へ新しい設定を即時同期するため、再読み込み前でも最新のメッセージや問い合わせ先 URL が反映されます

### インスタンス情報

* about-misskey-tempura ページ
* logo-tempura.svg / version / contributors / official & partner servers

### チェンジログ

* /tempura-changelog でカテゴリ別に独自機能を閲覧・検索できます

## 検索

* 高度な検索 (公開範囲・添付/CW/返信/投票・AND/OR・除外語・日時範囲・高度な構文)。日時範囲フィルタは標準の「投稿日時from / 投稿日時to」に統一しています
* copySearchUrl: 検索 URL をコピーでき、コピーした URL を開いたときに高度な検索オプション (公開範囲・添付/CW/返信/投票・AND/OR・除外語・日時範囲・高度な構文) も復元します

## 互換性と注意

* 独自機能一覧は稼働版に同梱した diff.md を取得します。GitHub 上の最新版は参照しません。変更の反映にはフロントエンドの再ビルド・配信が必要です
* 予約投稿は本家に導入済みのため除外
* ニックネームはクライアント側のみ

## 開発用 Storybook / Chromatic

* Storybook 10 用に旧addonとimportを移行。Misskeyテーマ切替は既存addonのMITライセンスを保持したローカル版へ移植。
* PRでは秘密情報を使わない静的Storybookビルドを検証し、成果物を短期保存する。Chromatic公開は別workflowで明示的に有効化する。
* ChromaticにはRepository secret `CHROMATIC_PROJECT_TOKEN` とVariables `CHROMATIC_ENABLED=true` / `CHROMATIC_APP_ID` が必要。トークンはチャットに貼らずGitHubへ直接登録する。
