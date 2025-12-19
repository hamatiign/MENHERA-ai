import * as vscode from 'vscode';
const say = require('say');
const path = require('path');
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { MENHERA_PROMPT } from "./prompt";
import responsesData from "./data/responses.json";

// ゴーストテキストの表示設定
const menheraDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 1em",
    color: "#ff69b4",
    fontStyle: "italic",
    fontWeight: "bold",
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const responses: { [key: string]: string } = responsesData;

// -1: 初期状態, 0以上: 前回のエラー数
let previousErrorCount = -1;

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

  const updateDecorations = async (editor: vscode.TextEditor) => {
    if (!editor) {
      return;
    }
    
    const config = vscode.workspace.getConfiguration("menhera-ai");
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        "APIキー設定してないよね？私のこと本気じゃないんだ... (設定を開きますか？)",
        "設定を開く"
      );
      if (action === "設定を開く") {
        vscode.commands.executeCommand(
          "workbenchPc.action.openSettings",
          "menhera-ai.apiKey"
        );
      }
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );

    if (errors.length === 0) {
      editor.setDecorations(menheraDecorationType, []);
      if (previousErrorCount === -1 || previousErrorCount > 0) {
        vscode.window.showInformationMessage(
          "エラーないね...完璧すぎてつまんない。もっと私に頼ってよ。"
        );
      }
      previousErrorCount = 0;
      return;
    }

    // エラーがあった場合の処理
    previousErrorCount = errors.length;
    const DecorationOptions: vscode.DecorationOptions[] = [];
    
    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(targetError.range.start.line).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      
      // APIまたはJSONからメッセージを取得
      const message = await CreateMessage(targetError, apiKey);

      const decolatinoOption: vscode.DecorationOptions = {
        range: range,
        renderOptions: {
          after: { contentText: message },
        },
        hoverMessage: message,
      };

      DecorationOptions.push(decolatinoOption);
    }

    editor.setDecorations(menheraDecorationType, DecorationOptions);
  };

  const helloWorldCommand = vscode.commands.registerCommand('menhera-ai.helloWorld', () => {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        const messages = [
            'ねぇ、その変数名なに？浮気？',
            'コード動いたね…でも私の心は動かないよ',
            'エラー出てないけど、私への愛は足りてる？'
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        vscode.window.showInformationMessage(randomMsg);
        say.speak(randomMsg, null, 1.0);
    } else {
        const errorMsg = 'ファイル開いてないじゃん…私のこと無視する気？信じられない...';
        vscode.window.showErrorMessage(errorMsg);
        say.speak(errorMsg, null, 1.0);

        const panel = vscode.window.createWebviewPanel('menheraAngry', '激怒中', vscode.ViewColumn.Two, {});
        const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'images', 'menhela-first.png'));
        const imageUri = panel.webview.asWebviewUri(onDiskPath);
        panel.webview.html = getWebviewContent(imageUri, errorMsg);
    }
  });

  context.subscriptions.push(helloWorldCommand);

  // ファイル書き換え（Diagnostics変更）時にAPIを呼び出すイベントリスナー
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
      updateDecorations(editor);
    }
  });

  // タブ切り替え時のリスナー
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      updateDecorations(editor);
    }
  });

  context.subscriptions.push(diagnosticDisposable, editorChangeDisposable);

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

// HTMLの中身を作る関数
function getWebviewContent(imageUri: vscode.Uri, text: string) {
    return `<!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>激怒</title>
        <style>
            body {
                background-color: #2b0000;
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center; /* タイポを修正 */
                height: 100vh;
                margin: 0;
            }
            img {
                max-width: 80%;
                border: 5px solid red;
                box-shadow: 0 0 20px red;
            }
            h1 {
                margin-top: 20px;
                font-family: sans-serif;
                text-shadow: 2px 2px 4px #000;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <img src="${imageUri}" />
        <h1>${text}</h1>
    </body>
    </html>`;
}

export function deactivate() {}

const GetJsonKey = (error: vscode.Diagnostic) => {
  const source = error.source ? error.source.toLowerCase() : "unknown";
  let codeString = "unknown";

  if (typeof error.code === "string" || typeof error.code === "number") {
    codeString = String(error.code);
  } else if (typeof error.code === "object" && error.code !== null) {
    codeString = String((error.code as any).value || "unknown");
  }

  return `${source}-${codeString}`;
};

const CreateMessage = async (
  targetError: vscode.Diagnostic,
  apiKey: string
): Promise<string> => {
  // JSONにあればそれを返す
  if (responses[GetJsonKey(targetError)]) {
    return responses[GetJsonKey(targetError)];
  }

  // なければ Gemini API で生成
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "メンヘラ化中...",
      cancellable: false,
    },
    async () => {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-flash-latest",
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        });

        const prompt = `${MENHERA_PROMPT}\n\nエラーメッセージ: "${targetError.message}"`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      } catch (err) {
        return "通信エラー...誰と電話してたの？(API Error)";
      }
    }
  );
};