import * as vscode from 'vscode';
import { MenheraViewProvider } from './mascotView';
import * as cp from 'child_process';
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

const hoverDecorationType = vscode.window.createTextEditorDecorationType({});

const responses: { [key: string]: string } = responsesData;
let previousErrorCount = -1;
let morePunished = false;
let stagnationTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラAIが起動しました...ずっと見てるからね。");

  // マスコット表示（サイドバー）
  const mascotProvider = new MenheraViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MenheraViewProvider.viewType, mascotProvider)
  );
  
  // 診断（赤波線）の監視用タイマー
  let timeout: NodeJS.Timeout | undefined = undefined;

  const updateDecorations = async (editor: vscode.TextEditor) => {
    if (!editor) { return; }

    // 自分が出した手紙（と追撃手紙）には反応しないようにする
    if (editor.document.fileName.endsWith("私からの手紙.txt") || editor.document.fileName.endsWith("まだ直さないの.txt")) {
        return;
    }

    const config = vscode.workspace.getConfiguration("menhera-ai");
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) { return; }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);

    // ==========================================
    // 🧹 1. エラーがない時（お掃除＆ご機嫌タイム）
    // ==========================================
    if (errors.length === 0) {
      editor.setDecorations(menheraDecorationType, []);
      await changeWindowColor(false);
      
      // ★マスコットを通常モードに戻す
      mascotProvider.updateMood(false);

      if (stagnationTimeout) {
          clearTimeout(stagnationTimeout);
          stagnationTimeout = undefined;
      }

      // 手紙ファイルを削除する処理
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
          const rootPath = workspaceFolders[0].uri;
          const filesToDelete = ["私からの手紙.txt", "まだ直さないの.txt"];

          for (const fileName of filesToDelete) {
              const fileUri = vscode.Uri.joinPath(rootPath, fileName);
              try {
                  const tabs = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
                  const targetTab = tabs.find(tab => 
                      tab.input instanceof vscode.TabInputText && 
                      tab.input.uri.path.endsWith(fileName)
                  );
                  if (targetTab) { await vscode.window.tabGroups.close(targetTab); }

                  await vscode.workspace.fs.stat(fileUri);
                  await vscode.workspace.fs.delete(fileUri, { useTrash: false });
              } catch (e) { /* 無視 */ }
          }

          if (hasPunished || morePunished) {
            vscode.window.showInformationMessage("機嫌なおったから、手紙全部捨てといたよ！");
          }
          hasPunished = false;
          morePunished = false;
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

    // ==========================================
    // 💀 2. エラー5個以上（お仕置き＆追撃セット）
    // ==========================================
    if (errors.length >= 5) {
        // ★サイドバーを「激怒モード」にする！
        mascotProvider.updateMood(true);
        mascotProvider.updateMessage("エラーこんなにあるじゃん…私のこと嫌いなの？");

        const workspaceFolders = vscode.workspace.workspaceFolders;

        // A. 最初のお仕置き（即時発動）
        if (!hasPunished && workspaceFolders) {
            hasPunished = true;
            await changeWindowColor(true);
            vscode.window.showErrorMessage("エラー直してくれないから...ね？");

            const audioPath = path.join(context.extensionPath, 'audio', 'first-letter-voice-ver2.wav');
            playAudio(audioPath);
            
            runPunishmentLogic(workspaceFolders, "私からの手紙.txt", "ねぇ...\n\nエラー、多すぎない...？\n\n私のこと大切にしてない証拠だよね。\n画面真っ赤にしちゃった...\nあなたのPCも私の心と同じ色になればいいのに。\n\n反省して直してよ。\n直してくれなきゃ、一生このままだよ...？"); 
        }

        // B. 追撃タイマー
        if (!stagnationTimeout && !morePunished && workspaceFolders) {
            stagnationTimeout = setTimeout(async () => {
              vscode.window.showErrorMessage("ずっと放置してる...信じられない。");

              const audioPath = path.join(context.extensionPath, 'audio', 'second-letter-voice.wav');
                playAudio(audioPath);
                await runPunishmentLogic(workspaceFolders, "まだ直さないの.txt", "...まだ直さないの？\n私のこと無視してるよね？\n\nもう許さないから。\nずっと見てるんだからね。");
                morePunished = true;
                stagnationTimeout = undefined;
            }, 30000); // 30秒後
        }

    } else {
        // 5個未満になったら通常モードに戻してあげる
        mascotProvider.updateMood(false);

        // 追撃タイマー解除
        if (stagnationTimeout) {
            clearTimeout(stagnationTimeout);
            stagnationTimeout = undefined;
        }
    }

    // エラーが減ったら（例えば3個以下になったら）許してあげる
    if (errors.length < 3) {
        hasPunished = false;
        morePunished = false;
    }

    // ゴーストテキスト表示
    const DecorationOptions: vscode.DecorationOptions[] = [];
    const hoverOptions: vscode.DecorationOptions[] = [];
    
    let sidebarMessage = "";
    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(targetError.range.start.line).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      const message = await CreateMessage(targetError, apiKey);

      if (i === 0) { sidebarMessage = message; }

      hoverOptions.push({
        range: targetError.range, // エラーの範囲（赤波線の場所）を指定
        hoverMessage: message     // 同じメッセージを設定
      });

      DecorationOptions.push({
        range: range,
        renderOptions: { after: { contentText: message } },
        hoverMessage: message,
      });
    }

    editor.setDecorations(menheraDecorationType, DecorationOptions);
    editor.setDecorations(hoverDecorationType, hoverOptions);
    if (sidebarMessage) {
      mascotProvider.updateMessage(sidebarMessage);
    }
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
        // エラー時は強制的に激怒モードにしてみる
        mascotProvider.updateMood(true);
        mascotProvider.updateMessage(errorMsg);
    }
  });
  context.subscriptions.push(helloWorldCommand);

  // 診断変更イベント
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      timeout = setTimeout(() => {
        updateDecorations(editor);
      }, 2000);
    }
  });

  const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
      vscode.window.visibleTextEditors.forEach(editor => {
          if (editor.document.uri.toString() === document.uri.toString()) {
              updateDecorations(editor);
          }
      });
  });
  context.subscriptions.push(saveDisposable);
  context.subscriptions.push(diagnosticDisposable);

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}

// ヘルパー関数たち
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

async function typeWriter(editor: vscode.TextEditor, text: string) {
    for (let i = 0; i < text.length; i++) {
        if (editor.document.isClosed) { return; }
        await editor.edit(editBuilder => {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            const endPos = lastLine.range.end;
            editBuilder.insert(endPos, text[i]);
        });
        const randomDelay = Math.floor(Math.random() * 175) + 80;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
    }
    await editor.document.save();
}

async function runPunishmentLogic(workspaceFolders: readonly vscode.WorkspaceFolder[], fileName: string, content: string) {
    const rootPath = workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(rootPath, fileName);
    
    try {
        const openedDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === fileUri.toString());
        let document: vscode.TextDocument;

        if (openedDoc) {
            document = openedDoc;
        } else {
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch {
                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
            }
            document = await vscode.workspace.openTextDocument(fileUri);
        }

        const editor = await vscode.window.showTextDocument(document, { 
            viewColumn: vscode.ViewColumn.Beside,
            preview: false 
        });

        await editor.edit(editBuilder => {
            const lastLine = document.lineAt(document.lineCount - 1);
            const range = new vscode.Range(0, 0, lastLine.range.end.line, lastLine.range.end.character);
            editBuilder.delete(range);
        });

        await typeWriter(editor, content);
    } catch (e) {
        console.error("お仕置き失敗", e);
    }
}

const CreateMessage = async (targetError: vscode.Diagnostic, apiKey: string): Promise<string> => {
  if (responses[GetJsonKey(targetError)]) {
    return responses[GetJsonKey(targetError)];
  }
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
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

// 🔊 画面を出さずに音を再生する関数（Windows/Mac対応）
function playAudio(filePath: string) {
    // ファイルパスのバックスラッシュを修正（Windows用）
    const safePath = filePath.replace(/\\/g, '\\\\');

    if (process.platform === 'win32') {
        // Windows: PowerShellを使って裏で再生（画面は出ません！）
        const command = `powershell -c (New-Object Media.SoundPlayer '${safePath}').PlaySync()`;
        cp.exec(command, (error) => {
            if (error) console.error("再生エラー:", error);
        });
    } else if (process.platform === 'darwin') {
        // Mac: afplayコマンド
        cp.exec(`afplay "${filePath}"`, (error) => {
            if (error) console.error("再生エラー:", error);
        });
    } else {
        // Linux: aplay (環境による)
        cp.exec(`aplay "${filePath}"`, (error) => {
            if (error) console.error("再生エラー:", error);
        });
    }
}