import * as vscode from "vscode";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { MENHERA_PROMPT, KEN_PROMPT } from "./prompt";

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

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
        return;
      }

      const targetError = errors[0].message;

      await vscode.window.withProgress(
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
                    "${MENHERA_PROMPT}"

                    エラーメッセージ: "${targetError}"
                `;

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            // 結果を表示
            vscode.window.showInformationMessage(response);
          } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(
              "通信エラー...誰と電話してたの？怒るよ？(API Error)"
            );
          }
        }
      );
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
