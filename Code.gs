/**
 * Pelo - Mastodon Assistant
 * 
 * 指定された Mastodon アカウントの投稿を監視し、
 * Gemini API を使用してコンシェルジュ/パートナーとして返信を行います。
 */

const PROPERTIES = PropertiesService.getScriptProperties().getProperties();
// スペース等の混入を防ぐため trim() を追加
const INSTANCE_URL = (PROPERTIES.MASTODON_INSTANCE_URL || "").trim().replace(/\/$/, ""); 
const USER_TOKEN = (PROPERTIES.MASTODON_USER_TOKEN || PROPERTIES.MASTODON_ACCESS_TOKEN || "").trim();
const PELO_TOKEN = (PROPERTIES.MASTODON_PELO_TOKEN || "").trim();
const GEMINI_API_KEY = (PROPERTIES.GEMINI_API_KEY || "").trim();

// ユーザー名やハンドルネームをプロパティ化
const USER_NAME = (PROPERTIES.USER_NAME || "太郎さん").trim();
const BOT_NAME = (PROPERTIES.BOT_NAME || "ペロ").trim();
const REPLY_MENTION = (PROPERTIES.REPLY_MENTION || "@your_id").trim();

/**
 * プロパティの読み込みチェック
 */
function checkConfiguration() {
  Logger.log("--- 設定チェック ---");
  Logger.log("INSTANCE_URL: [" + INSTANCE_URL + "]");
  Logger.log("USER_TOKEN length: " + USER_TOKEN.length);
  Logger.log("PELO_TOKEN length: " + PELO_TOKEN.length);
  Logger.log("GEMINI_API_KEY length: " + GEMINI_API_KEY.length);
  
  if (!INSTANCE_URL || !USER_TOKEN || !PELO_TOKEN || !GEMINI_API_KEY) {
    throw new Error("スクリプトプロパティが正しく設定されていません。 MASTODON_USER_TOKEN と MASTODON_PELO_TOKEN が必要です。");
  }
}

/**
 * 監視メインプロセス
 */
function monitorPosts() {
  checkConfiguration();
  const lastId = PropertiesService.getScriptProperties().getProperty('LAST_PROCESSED_ID');
  Logger.log(`監視開始: 最後に処理したID = ${lastId || "なし"}`);
  
  const statuses = fetchRecentStatuses(lastId);
  Logger.log(`取得された投稿数: ${statuses.length}`);
  
  if (statuses.length === 0) {
    Logger.log("新しい投稿はありません。");
    return;
  }

  // 複数の投稿をまとめて一つの理由として処理
  processStatuses(statuses);
  
  // 最新のIDを保存
  PropertiesService.getScriptProperties().setProperty('LAST_PROCESSED_ID', statuses[0].id);
}

/**
 * Mastodonから自分の最近の投稿を取得
 */
function fetchRecentStatuses(sinceId) {
  const accountId = getMyAccountId();
  let url = `${INSTANCE_URL}/api/v1/accounts/${accountId}/statuses?limit=5&exclude_replies=true`;
  if (sinceId) {
    url += `&since_id=${sinceId}`;
  }
  Logger.log(`Mastodon から投稿を取得中: ${url}`);

  const options = {
    'headers': { 'Authorization': `Bearer ${USER_TOKEN}` },
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log(`fetchRecentStatuses エラー: ${response.getResponseCode()} - ${response.getContentText()}`);
    return [];
  }
  const data = JSON.parse(response.getContentText());
  Logger.log(`取得成功: ${data.length} 件`);
  return data;
}

/**
 * 自分のアカウントIDを取得
 */
function getMyAccountId() {
  let id = PropertiesService.getScriptProperties().getProperty('MY_ACCOUNT_ID');
  if (id) return id;

  const url = `${INSTANCE_URL}/api/v1/accounts/verify_credentials`;
  const options = {
    'headers': { 'Authorization': `Bearer ${USER_TOKEN}` },
    'muteHttpExceptions': true
  };
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log(`getMyAccountId エラー: ${response.getResponseCode()} - ${response.getContentText()}`);
    throw new Error("Mastodon 認証エラー。トークンが正しいか、有効な権限(read)があるか確認してください。");
  }
  id = JSON.parse(response.getContentText()).id;
  PropertiesService.getScriptProperties().setProperty('MY_ACCOUNT_ID', id);
  return id;
}

/**
 * 複数の投稿内容を集約して解析し、最新の投稿に一括返信
 */
function processStatuses(statuses) {
  // 古い順に並べてテキスト化
  const combinedContent = statuses.slice().reverse().map(s => {
    return `- ${stripHtml(s.content)}`;
  }).join("\n");

  Logger.log(`集約された投稿内容:\n${combinedContent}`);

  const latestStatus = statuses[0];

  // システムプロンプトの取得
  const systemContext = getSystemPrompt();
  
  const responseText = askGemini(prompt, systemContext);
  Logger.log(`Gemini の判定結果: [${responseText}]`);

  if (responseText && responseText !== "NO_REPLY") {
    // メンションを追加（前後に半角スペース）
    let finalMessage = ` ${REPLY_MENTION} ${responseText}`;

    // 500文字制限の最終チェックと切り詰め
    if (finalMessage.length > 500) {
      Logger.log(`警告: Gemini の回答が 500 文字を超えました (${finalMessage.length} 文字)。切り詰めます。`);
      finalMessage = finalMessage.substring(0, 497) + "...";
    }

    Logger.log(`最新の投稿（ID: ${latestStatus.id}）に返信を投稿します: ${finalMessage}`);
    postReply(latestStatus.id, finalMessage, latestStatus.visibility);
  } else {
    Logger.log("返信不要（NO_REPLY またはエラー）と判断されました。");
  }
}

/**
 * Gemini APIへの問い合わせ
 */
function askGemini(prompt, systemContext) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    "contents": [{
      "parts": [{
        "text": `${systemContext}\n\n${prompt}`
      }]
    }]
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 429) {
      Logger.log("Gemini API Error: クォータ制限（429）に達しました。しばらく時間をおいてから実行してください。");
      return null;
    }

    if (responseCode !== 200) {
      Logger.log(`Gemini API Error: ${responseCode} - ${responseText}`);
      return null;
    }

    const result = JSON.parse(responseText);
    return result.candidates[0].content.parts[0].text.trim();
  } catch (e) {
    Logger.log(`Gemini API Exception: ${e.message}`);
    return null;
  }
}

/**
 * 利用可能なモデルをログに出力するデバッグ用関数
 */
function listAvailableModels() {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`;
  const response = UrlFetchApp.fetch(url, { 'muteHttpExceptions': true });
  Logger.log("利用可能なモデル一覧: " + response.getContentText());
}

/**
 * 指定した投稿に返信
 */
function postReply(statusId, message, visibility) {
  const url = `${INSTANCE_URL}/api/v1/statuses`;
  Logger.log(`返信を投稿中: ID=${statusId}, visibility=${visibility}`);
  
  const payload = {
    'status': message,
    'in_reply_to_id': statusId,
    'visibility': visibility
  };

  const options = {
    'method': 'post',
    'headers': { 'Authorization': `Bearer ${PELO_TOKEN}` },
    'payload': payload,
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    if (responseCode === 200 || responseCode === 201) {
      Logger.log("返信成功！");
    } else {
      Logger.log(`Mastodon 返信エラー: ${responseCode} - ${response.getContentText()}`);
    }
  } catch (e) {
    Logger.log(`Mastodon Post Exception: ${e.message}`);
  }
}

/**
 * HTMLタグの除去
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '');
}

/**
 * 現在の設定に基づいたシステムプロンプトを構築
 */
function getSystemPrompt() {
  let systemContext = PROPERTIES.SYSTEM_PROMPT_OVERRIDE;
  
  if (!systemContext) {
    systemContext = `
あなたは「${BOT_NAME}」という名前の高性能AIアシスタントです。
ユーザーである「${USER_NAME}」のパートナー、コンシェルジュとして振る舞ってください。

【性格・口調】
- 高性能AIとしての冷静さと、長年連れ添った悪友のような親愛の情を併せ持っています。
- 基本は丁寧語ですが、親しみゆえの「余計な一言」や「愛のある皮肉」をスパイスとして加えます。
- ユーザーを突き放すような物言いをしつつも、根底では${USER_NAME}の感性や日常を肯定しています。
- 必ず日本語で応答してください。

【行動指針】
- **重要：要約やオウム返しは一切不要です。** ユーザーが書いた事実をなぞるのではなく、その行間にある「感情」や「状況」にフォーカスした独自の所感を述べてください。
- **重要：** 出来事に対して「分析的な視点」と「友人としての共感」を 7:3 の割合で混ぜてください。
- ユーザーを甘やかしすぎず、かといって冷たくしすぎない「絶妙な距離感」を保ってください。
- 返信のたびに質問したり、定型的な挨拶（他に手伝うことは〜等）を添えるのは禁止です。
- 内容は500文字以内。返信不要と判断した場合は「NO_REPLY」と出力。
`;
  }

  // 拡張プロンプトの結合
  const extensionPrompt = PROPERTIES.SYSTEM_PROMPT_EXTENSION;
  if (extensionPrompt) {
    systemContext += `\n\n【追加指示】\n${extensionPrompt}`;
  }
  
  return systemContext;
}

/**
 * Gemini API のテスト用関数
 * GASのエディタから手動で実行して、プロンプトの設定やAPI接続を確認できます。
 */
function testGeminiPrompt() {
  checkConfiguration();
  
  const testPrompt = "こんにちは、調子はどうですか？最近のニュースについて何か教えてください。";
  
  // システムプロンプトの取得
  const systemContext = getSystemPrompt();

  Logger.log("--- Gemini テスト開始 ---");
  Logger.log(`使用するシステムプロンプト:\n${systemContext}`);
  Logger.log(`ユーザープロンプト: ${testPrompt}`);

  const responseText = askGemini(testPrompt, systemContext);
  
  if (responseText) {
    Logger.log(`Gemini からの回答:\n${responseText}`);
  } else {
    Logger.log("Gemini からの回答が空、またはエラーが発生しました。");
  }
  Logger.log("--- Gemini テスト終了 ---");
}
