import * as vscode from "vscode";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { MENHERA_PROMPT, KEN_PROMPT } from "./prompt";
import { create } from "domain";
import { createHmac } from "crypto";
import responsesData from "./data/responses.json";
import { error } from "console";

//　ゴーストテキストの表示設定
const menheraDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 1em",
    color: "#ff69b4", // ピンク色
    fontStyle: "italic",
    fontWeight: "bold",
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// 型定義（TypeScriptにJSONの中身が文字列の辞書だと教える）
const responses: { [key: string]: string } = responsesData;

// -1: 初期状態, 0以上: 前回のエラー数
let previousErrorCount = -1;

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

  const updateDecorations = async (editor: vscode.TextEditor) => {
    if (!editor) {
      vscode.window.showErrorMessage(
        "ファイル開いてないじゃん…私のこと無視する気？"
      );
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
        previousErrorCount = 0;
        return;
      }
      previousErrorCount = 0;
      return;
    }

    // 以下エラーがあった場合の処理
    previousErrorCount = errors.length;
    const DecorationOptions: vscode.DecorationOptions[] = [];
    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];

      // errors.rangeを使うと、コードの間にテキストが入り込んでしまうため、エラーの行末を指定
      const EndOfErrorLine = editor.document.lineAt(errors[i].range.start.line)
        .range.end;

      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      const DecolatinoOption: vscode.DecorationOptions = {
        range: range,
        renderOptions: {
          after: {
            contentText: await CreateMessage(targetError, apiKey),
          },
        },
        hoverMessage: await CreateMessage(targetError, apiKey),
      };

      DecorationOptions.push(DecolatinoOption);
    }

    editor.setDecorations(menheraDecorationType, DecorationOptions);
  };

  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      // イベントが起きたファイルが、今開いているファイルと同じなら実行
      if (
        editor &&
        event.uris.some(
          (uri) => uri.toString() === editor.document.uri.toString()
        )
      ) {
        updateDecorations(editor);
      }
    }
  );

  // 2. 開いているタブ（ファイル）を切り替えた時
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    }
  );

  context.subscriptions.push(diagnosticDisposable);
  context.subscriptions.push(editorChangeDisposable);

  // 3. 起動時に一度だけ実行（すでにファイルを開いている場合用）
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}

const GetJsonKey = (error: vscode.Diagnostic) => {
  const source = error.source ? error.source.toLowerCase() : "unknown";

  let codeString = "unknown";

  // 型チェックをして中身を取り出す
  if (typeof error.code === "string" || typeof error.code === "number") {
    // 文字列か数字なら、そのまま文字列化
    codeString = String(error.code);
  } else if (typeof error.code === "object" && error.code !== null) {
    // オブジェクトなら、.value の中身を使う
    codeString = String(error.code?.value);
  }

  console.log(codeString); // -> "2322" や "no-unused-vars" になる
  console.log("jsonkey:", `${source}-${codeString}`);
  return `${source}-${codeString}`;
};

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
          // メンヘラ構文が攻撃的だとブロックされるので、セーフティを外す必要がある
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        });

        // AIへの指示（プロンプト）
        const prompt = `
                    "${KEN_PROMPT}"

                    エラーメッセージ: "${targetError.message}"
                `;

        const result = await model.generateContent(prompt);
        const response = result.response.text();
        return response;
      } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage(
          "通信エラー...誰と電話してたの？怒るよ？(API Error)"
        );
        return "API error";
      }
    }
  );
};
