import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // 起動確認ログ
  console.log("メンヘラCopilotが起動しました...ずっと見てるからね。");

  // コマンドが実行されたときの処理
  // ※ 'menhera-ai.helloWorld' の部分は package.json の "command" と同じにする必要があります
  const disposable = vscode.commands.registerCommand(
    "menhera-ai.helloWorld",
    () => {
      // 【重要】ここで「今開いているエディタ」を取得します
      const editor = vscode.window.activeTextEditor;

      // エディタが存在するかチェック（ここがさっきのエラーの対策！）
      if (editor) {
        // ファイルが開かれている場合
        const messages = [
          "ねぇ、その変数名なに？浮気？",
          "コード動いたね…でも私の心は動かないよ",
          "エラー出てないけど、私への愛は足りてる？",
          "そんな書き方して...私のこと嫌いなんでしょ？",
        ];
        // ランダムにセリフを選ぶ
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];

        vscode.window.showInformationMessage(randomMsg);
      } else {
        // 【対策】ファイルが開かれていない場合
        // ここで .document にアクセスしようとすると死ぬので、
        // エラーメッセージだけ出して終わらせます。
        vscode.window.showErrorMessage(
          "ファイル開いてないじゃん…私のこと無視する気？信じられない..."
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
