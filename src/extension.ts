import * as vscode from "vscode";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { MENHERA_PROMPT, KEN_PROMPT } from "./prompt";
import { create } from "domain";
import { createHmac } from "crypto";

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

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

  const disposable = vscode.commands.registerCommand(
    "menhera-ai.helloWorld",
    async () => {
      const editor = vscode.window.activeTextEditor;
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
        vscode.window.showInformationMessage(
          "エラーないね...完璧すぎてつまんない。もっと私に頼ってよ。"
        );
        editor.setDecorations(menheraDecorationType, []);
        return;
      }

      const targetError = errors[0].message;
      const DecorationOptions: vscode.DecorationOptions[] = [];
      for (let i = 0; i < errors.length; i++) {
        const targetError = errors[i].message;

        // errors.rangeを使うと、コードの間にテキストが入り込んでしまうため、エラーの行末を指定
        const EndOfErrorLine = editor.document.lineAt(
          errors[i].range.start.line
        ).range.end;

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
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

const CreateMessage = async (
  targetError: string,
  apiKey: string
): Promise<string> => {
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

                    エラーメッセージ: "${targetError}"
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
