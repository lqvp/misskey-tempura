# 定義されたパス
$sourceFile = "locales/ja-JP.yml"
$destinationFile = "locales/ja-NYA.yml"

# ja-NYA.ymlが存在する場合、一度削除する
if (Test-Path $destinationFile) {
    Remove-Item $destinationFile
}

# ja-JP.yml を ja-NYA.yml にコピーする
Copy-Item $sourceFile $destinationFile

# ja-NYA.yml の内容を読み込み
$content = Get-Content $destinationFile

# な→にゃ, ナ→ニャ に変換
$content = $content -replace 'な', 'にゃ' -replace 'ナ', 'ニャ'

# 変換後の内容を ja-NYA.yml に上書き保存
Set-Content -Path $destinationFile -Value $content

Write-Host "変換が完了しました。ja-NYA.yml に保存されました。"
