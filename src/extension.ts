import * as vscode from 'vscode';
import { MenheraViewProvider } from './mascotView'; // ▼ 復活させました
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
let hasPunished = false;
const menheraDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 1em",
    color: "#ff69b4", // ピンク色
    fontStyle: "italic",
    fontWeight: "bold",
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// 型定義
const responses: { [key: string]: string } = responsesData;

// -1: 初期状態, 0以上: 前回のエラー数
let previousErrorCount = -1;

let morePunished = false;
let stagnationTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

  // マスコット表示（サイドバー）
  const mascotProvider = new MenheraViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MenheraViewProvider.viewType, mascotProvider)
  );

  // パネル（ウィンドウ）の状態を管理する変数
  let currentPanel: vscode.WebviewPanel | undefined = undefined;
  
  // 診断（赤波線）の監視用タイマー
  let timeout: NodeJS.Timeout | undefined = undefined;

  const updateDecorations = async (editor: vscode.TextEditor) => {

    if (!editor) {
      return;
    }

    if (editor.document.fileName.endsWith("私からの手紙.txt")) {
        return;
    }

    const config = vscode.workspace.getConfiguration("menhera-ai");
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) {
       // APIキーがない場合の処理（省略可だが残しておく）
       return; 
    }

    if (stagnationTimeout) {
            clearTimeout(stagnationTimeout);
            stagnationTimeout = undefined;
        }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );

    // --- エラーが0個（解決済み）の時の処理 ---
    if (errors.length === 0) {
      editor.setDecorations(menheraDecorationType, []);

      // パネルが開いていたら閉じる
      if (currentPanel) {
        currentPanel.dispose();
        currentPanel = undefined;
      }
      
      // 画面の色を元に戻す
      await changeWindowColor(false);

      // 手紙ファイルを削除する処理
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
          const rootPath = workspaceFolders[0].uri;
          const fileUri = vscode.Uri.joinPath(rootPath, "私からの手紙.txt"); // 消すファイル名
          const deleteFile = vscode.Uri.joinPath(rootPath, "まだ直さないの.txt");

          try {
             // 今開いている全タブの中から「私からの手紙.txt」を探す
              const tabs = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
              const letterTab = tabs.find(tab => 
                  tab.input instanceof vscode.TabInputText && 
                  tab.input.uri.path.endsWith("私からの手紙.txt")
              );
              
              // 見つかったら閉じる
              if (letterTab) {
                  await vscode.window.tabGroups.close(letterTab);
              }

              // 1. まずファイルがあるか確認
              await vscode.workspace.fs.stat(fileUri);
              
              // 2. 中身を空っぽにする（上書き）
              await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
              
              // 3. その後、ファイルを削除する
              await vscode.workspace.fs.delete(fileUri, { useTrash: false });
              vscode.window.showInformationMessage("あの手紙捨てといたよ！感謝してね。でも次やったら...その時はわかるよね？");
              hasPunished = false;
          } catch (e) {
              // ファイルがない場合は無視
          }

          try {
              // 2. ファイルが存在するか確認（存在しないとエラーが出てcatchに飛ぶ）
              await vscode.workspace.fs.stat(deleteFile);
              
              // 3. 存在したら削除実行！
              // { useTrash: false } にするとゴミ箱にも入れずに完全消去します（怖い）
              await vscode.workspace.fs.delete(deleteFile, { useTrash: true });
              
              
              // フラグもリセット（これでまたエラーが増えたら手紙が作られる）
              hasPunished = false;

          } catch (e) {
              // ファイルがもともと無いときは何もしない（スルー）
          }
      }

      if (previousErrorCount === -1 || previousErrorCount > 0) {
        const msg = "エラーないね...完璧すぎてつまんない。もっと私に頼ってよ。";
        vscode.window.showInformationMessage(msg);
        mascotProvider.updateMessage(msg);
      }
      previousErrorCount = 0;
      return;
    }

    // --- エラーがある場合の処理 ---
    previousErrorCount = errors.length;

    // ▼ エラー5個以上ならウィンドウを開く
    if (errors.length >= 5) {
        if (!currentPanel) {
            currentPanel = vscode.window.createWebviewPanel(
                'menheraAngry',
                '激怒中',
                vscode.ViewColumn.Two,
                {}
            );

            // 画像パスの修正 (src/assets/images/menhela-first-Photoroom.png)
            const onDiskPath = vscode.Uri.file(
                path.join(context.extensionPath, 'images', 'menhela-first.png')
            );
            const imageUri = currentPanel.webview.asWebviewUri(onDiskPath);
            
            const angryMsg = `エラーこんなにあるじゃん…私のこと嫌いなの？`;
            currentPanel.webview.html = getWebviewContent(imageUri, angryMsg);

            currentPanel.onDidDispose(
                () => { currentPanel = undefined; },
                null,
                context.subscriptions
            );
        }
    } else {
        // 5個未満になったら閉じる
        if (currentPanel) {
            currentPanel.dispose();
            currentPanel = undefined;
        }
    }
    
    // --- 2. ここに追加！「エラー5個以上でお仕置き」ロジック ---}
    // 💀 お仕置きタイム
    if (errors.length >= 5 && !hasPunished) {
        hasPunished = true; // 連打防止フラグ

        await changeWindowColor(true);

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            const fileName = "私からの手紙.txt";
            const messageContent = "ねぇ...\n\nエラー、多すぎない...？\n\n私のこと大切にしてない証拠だよね。\n\n画面、真っ赤にしちゃった。\nあなたのPCも私の心と同じ色になればいいのに。\n\n反省して直してよ。\n直してくれなきゃ、一生このままだよ...？";
            
            const rootPath = workspaceFolders[0].uri;
            const fileUri = vscode.Uri.joinPath(rootPath, fileName);
            
            try {
                vscode.window.showErrorMessage("エラー直してくれないから手紙書いておいたよ読んで...ね？");

                // ▼▼▼ 修正のキモ：すでに開いているかチェックする！ ▼▼▼
                const openedDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === fileUri.toString());
                
                let document: vscode.TextDocument;

                if (openedDoc) {
                    // A. すでに開いているなら、それを使う（勝手にファイルを作らない！）
                    document = openedDoc;
                } else {
                    // B. 開いていないなら、ファイルがあるか確認して、なければ作る
                    try {
                        await vscode.workspace.fs.stat(fileUri);
                    } catch {
                        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
                    }
                    document = await vscode.workspace.openTextDocument(fileUri);
                }
                // ▲▲▲▲▲▲▲▲▲

                // エディタを表示
                const letterEditor = await vscode.window.showTextDocument(document, { 
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: false 
                });

                // 中身を全消し（リセット）
                await letterEditor.edit(editBuilder => {
                    const lastLine = document.lineAt(document.lineCount - 1);
                    const range = new vscode.Range(0, 0, lastLine.range.end.line, lastLine.range.end.character);
                    editBuilder.delete(range);
                });

                // 書き込み開始
                await typeWriter(letterEditor, messageContent);
                
            } catch (error) {
                console.error("お仕置き失敗...", error);
                hasPunished = false;
            }
        }
    }

    // エラーが5個以上のままなら、30秒後の時限爆弾をセット
        if (errors.length >= 5) {
            stagnationTimeout = setTimeout(async () => {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    const rootPath = workspaceFolders[0].uri;
                    // 追撃用ファイル名
                    const curseFileName = "まだ直さないの.txt";
                    const curseContent = "...まだ直さないの？\n私のこと無視してるよね？\n\nもう許さないから。\nずっと見てるんだからね。";
                    const curseFileUri = vscode.Uri.joinPath(rootPath, curseFileName);

                    try {
                        // ファイル作成
                        await vscode.workspace.fs.writeFile(curseFileUri, new Uint8Array());
                        
                        // メッセージ表示
                        vscode.window.showErrorMessage("ずっと放置してる...信じられない。");
                        
                        // ファイルを開く
                        const doc = await vscode.workspace.openTextDocument(curseFileUri);
                        const noFixLetter =  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
                        
                        typeWriter(noFixLetter, curseContent);

                        morePunished = true;

                    } catch (e) {
                        console.error("追撃失敗", e);
                    }
                }
            }, 10000); // 30秒後に実行
        }

    // エラーが減ったら（例えば3個以下になったら）許してあげる（フラグをリセット）
    if (errors.length < 3) {
        hasPunished = false;
        morePunished = false;
    }

    // ゴーストテキスト（AIメッセージ）の生成と表示
    const DecorationOptions: vscode.DecorationOptions[] = [];

    let sidebarMessage = "";
    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(targetError.range.start.line).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      
      const message = await CreateMessage(targetError, apiKey);

      if (i === 0) {
        sidebarMessage = message;
      }

      const decorationOption: vscode.DecorationOptions = {
        range: range,
        renderOptions: {
          after: { contentText: message },
        },
        hoverMessage: message,
      };

      DecorationOptions.push(decorationOption);
    }

    editor.setDecorations(menheraDecorationType, DecorationOptions);
    if (sidebarMessage) {
      mascotProvider.updateMessage(sidebarMessage);
    }
  };

  // helloWorldコマンド（ちぎれていた部分を修復）
  const helloWorldCommand = vscode.commands.registerCommand('menhera-ai.helloWorld', () => {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        // 通常時（ファイルを開いている時）
        const messages = [
            'ねぇ、その変数名なに？浮気？',
            'コード動いたね…でも私の心は動かないよ',
            'エラー出てないけど、私への愛は足りてる？'
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        vscode.window.showInformationMessage(randomMsg);
        say.speak(randomMsg, null, 1.0);
    } else {
        // エラー時（ファイルを開いていない時）
        const errorMsg = 'ファイル開いてないじゃん…私のこと無視する気？信じられない...';
        vscode.window.showErrorMessage(errorMsg);
        say.speak(errorMsg, null, 1.0);

        const panel = vscode.window.createWebviewPanel('menheraAngry', '激怒中', vscode.ViewColumn.Two, {});
        // 画像パス修正
        const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'src', 'assets', 'images', 'menhera.png'));
        const imageUri = panel.webview.asWebviewUri(onDiskPath);
        panel.webview.html = getWebviewContent(imageUri, errorMsg);
    }
  });

  context.subscriptions.push(helloWorldCommand);

  // 診断変更イベント（デバウンス処理付き）
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      timeout = setTimeout(() => {
        updateDecorations(editor);
      }, 2000); // 2秒後に実行（頻繁なAPI呼び出しを防ぐ）
    }
  });

  context.subscriptions.push(diagnosticDisposable);

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

// HTML生成関数
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
                justify-content: center;
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

// エラーコード取得用
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

// 画面色変更関数
const changeWindowColor = async (isAngry: boolean) => {
    const config = vscode.workspace.getConfiguration();
    if (isAngry) {
        await config.update("workbench.colorCustomizations", {
            "editor.background": "#1a0000",
            "activityBar.background": "#8b0000",
            "statusBar.background": "#ff0000",
            "statusBar.foreground": "#ffffff",
            "titleBar.activeBackground": "#8b0000"
        }, vscode.ConfigurationTarget.Workspace);
    } else {
        await config.update("workbench.colorCustomizations", undefined, vscode.ConfigurationTarget.Workspace);
    }
};

// タイプライター演出関数
async function typeWriter(editor: vscode.TextEditor, text: string) {
    for (let i = 0; i < text.length; i++) {
        if (editor.document.isClosed) { return; }
        await editor.edit(editBuilder => {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            const endPos = lastLine.range.end;
            editBuilder.insert(endPos, text[i]);
        });
        const randomDelay = Math.floor(Math.random() * 100) + 50;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    await editor.document.save();
}

// AIメッセージ生成関数
const CreateMessage = async (
  targetError: vscode.Diagnostic,
  apiKey: string
): Promise<string> => {
  if (responses[GetJsonKey(targetError)]) {
    return responses[GetJsonKey(targetError)];
  }

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