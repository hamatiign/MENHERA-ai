import * as vscode from 'vscode';
import { MenheraViewProvider } from './mascotView';
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
    color: "#ff69b4",
    fontStyle: "italic",
    fontWeight: "bold",
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const responses: { [key: string]: string } = responsesData;

let previousErrorCount = -1;

export function activate(context: vscode.ExtensionContext) {
  
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");
  const mascotProvider = new MenheraViewProvider(context.extensionUri);

    // ビューを登録（package.jsonに書いたIDと一致させる）
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(MenheraViewProvider.viewType, mascotProvider)
    );

  let timeout: NodeJS.Timeout | undefined = undefined;

  const updateDecorations = async (editor: vscode.TextEditor) => {
 
    if (!editor) {
      return;
    }

    if (editor.document.languageId === 'plaintext') {
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

      const workspaceFolders = vscode.workspace.workspaceFolders;
      
      if (workspaceFolders) {
          const rootPath = workspaceFolders[0].uri;
          const fileUri = vscode.Uri.joinPath(rootPath, "私からの手紙.txt"); // 消すファイル名

          try {
              // 2. ファイルが存在するか確認（存在しないとエラーが出てcatchに飛ぶ）
              await vscode.workspace.fs.stat(fileUri);
              
              // 3. 存在したら削除実行！
              // { useTrash: false } にするとゴミ箱にも入れずに完全消去します（怖い）
              await vscode.workspace.fs.delete(fileUri, { useTrash: false });
              
              vscode.window.showInformationMessage("あの手紙捨てといたよ！感謝してね。でも次やったら...その時はわかるよね？");
              
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

    // エラーがあった場合の処理
    previousErrorCount = errors.length;
    
    // --- 2. ここに追加！「エラー5個以上でお仕置き」ロジック ---
    if (errors.length >= 5 && !hasPunished) {
        // ワークスペース（今開いているフォルダ）の場所を取得
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders) {
            const rootPath = workspaceFolders[0].uri;
            
            // 作成するファイル名と中身
            const fileName = "私からの手紙.txt";
            const fileContent = "ねぇ、エラー多すぎない？\n私のこと大切にしてない証拠だよね。\n\nもう知らない。\n\n反省して直してよ。\n直してくれなきゃ、もっとファイル増やすからね。";
            
            // ファイルの保存場所を決める
            
            const newFileUri = vscode.Uri.joinPath(rootPath, fileName);
            
            // 文字を書き込める形式(Uint8Array)に変換
            const encodedContent = new TextEncoder().encode(fileContent);

            try {
                // ファイルを作成！
                await vscode.workspace.fs.writeFile(newFileUri, encodedContent);
                
                vscode.window.showErrorMessage("エラーが多すぎるから、手紙書いておいたよ...読んでね。");

                const document = await vscode.workspace.openTextDocument(newFileUri);
                await vscode.window.showTextDocument(document, { 
                    viewColumn: vscode.ViewColumn.Beside, // ★隣の列に開く
                    preview: false                        // ★プレビューじゃなく確定状態で開く
                });
                
                // 「お仕置き済み」にする（これをしないと文字を打つたびにファイルが作られ続ける！）
                hasPunished = true; 
            } catch (error) {
                console.error("ファイル作成失敗...", error);
            }
        }
    }

    // エラーが減ったら（例えば3個以下になったら）許してあげる（フラグをリセット）
    if (errors.length < 3) {
        hasPunished = false;
    }

    const DecorationOptions: vscode.DecorationOptions[] = [];
    



    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(targetError.range.start.line).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      
      // APIまたはJSONからメッセージを取得
      const message = await CreateMessage(targetError, apiKey);

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
    mascotProvider.updateMessage('仮メッセージ');
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
    
    // 変更があったファイルが現在開いているファイルか確認
    if (editor && event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
      
      // 既存のタイマーがあればキャンセル（＝前の入力を無かったことにして待ち時間をリセット）
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }



      // 新しいタイマーをセット（例: 1000ミリ秒 = 1秒後に実行）
      timeout = setTimeout(() => {
        updateDecorations(editor);
      }, 5000); 
    }
  }
);

  // 2. 開いているタブ（ファイル）を切り替えた時 => タブ切り替えでも何度も走っちゃうので消す（いったんコメントアウトでごまかしてる）
  // const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
  //   if (editor) {
  //     // タブ切り替え時はすぐに表示したいのでデバウンスなし
  //     updateDecorations(editor);
  //   }
  // });

  context.subscriptions.push(diagnosticDisposable,);

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