#!/bin/bash

source_file="locales/ja-JP.yml"
destination_file="locales/ja-NYA.yml"

# Remove destination file if exists
[ -f "$destination_file" ] && rm "$destination_file"

# Copy source to destination
cp "$source_file" "$destination_file"

# Replace text using sed
sed -i'' -e 's/日本語/にゃにゃにゃ！/g' \
        -e 's/な/にゃ/g' \
        -e 's/ナ/ニャ/g' \
        "$destination_file"

echo "変換が完了しました。ja-NYA.yml に保存されました。"
