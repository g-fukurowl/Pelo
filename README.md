# Pelo - Mastodon Assistant (GAS + Gemini)

慇懃無礼な高性能AI「ペロ」が、あなたの Mastodon での連投をそっと（あるいは辛辣に）見守り、分析・評価してくれる Google Apps Script です。

## 特徴

- **連投の集約**: 実行タイミングでの複数の新規投稿をひとつの文脈としてまとめます。
- **一括返信**: 最新の投稿に対して、全ての文脈を踏まえた総括的な一言を返信します。
- **インテリジェンス**: Google Gemini API (2.5 Flash など) を使用した高度な分析。
- **人格設定**: 丁寧ながらも毒気のある、有能なAIアシスタント兼友人という独特のキャラクター。
- **制限対応**: Mastodon の 500 文字制限、Gemini API のクォータ制限に配慮した設計。

## セットアップ

### 1. 準備

- Mastodon アカウント（監視対象）のアクセストークン（閲覧権限）
- ペロ用 Mastodon アカウントのアクセストークン（投稿権限）
- Google Gemini API キー（[Google AI Studio](https://aistudio.google.com/) で取得）

### 2. インストール

1. Google Apps Script の空プロジェクトを作成します。
2. `Code.gs` と `appsscript.json` の内容をコピー＆ペーストします（または `clasp` を使用）。

### 3. スクリプトプロパティの設定

GAS のプロジェクト設定で、以下のプロパティを設定してください：

| プロパティ名 | 内容 | 例 |
| :--- | :--- | :--- |
| `MASTODON_INSTANCE_URL` | Mastodon インスタンスのURL | `https://your.mastodon.instance` |
| `MASTODON_USER_TOKEN` | 監視対象アカウントのトークン | (アクセストークン) |
| `MASTODON_PELO_TOKEN` | 返信用アカウントのトークン | (アクセストークン) |
| `GEMINI_API_KEY` | Gemini API キー | (API キー) |
| `USER_NAME` | あなたの呼び名 | `太郎さん` |
| `BOT_NAME` | ボットの名前 | `ペロ` |
| `REPLY_MENTION` | 返信時のメンション先 | `@your_id` |
| `SYSTEM_PROMPT_OVERRIDE` | 性格を完全上書きする場合に使用 | (任意のテキスト) |

### 4. トリガーの設定

1. 左側の「トリガー」（目覚まし時計アイコン）クリック。
2. `monitorPosts` 関数を、**「時間主導型」**かつ**「分ベースのタイマー」**（例：5分または10分おき）で実行するように設定します。

## ライセンス

MIT License
