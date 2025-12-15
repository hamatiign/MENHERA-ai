import * as vscode from "vscode";

// 装飾（ゴーストテキスト）のスタイルを定義
// ピンク色で、斜体にして、少し左に隙間(margin)を空ける設定です
const menheraDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 1em", // コードから1文字分あける
    color: "#ff69b4", // メンヘラピンク
    fontStyle: "italic", // 怖い感じを出す斜体
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

export function activate(context: vscode.ExtensionContext) {
  console.log("メンヘラCopilot (Ghost Ver) が起動しました...");

  const disposable = vscode.commands.registerCommand(
    "menhera-ai.helloWorld",
    () => {
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        // -----------------------------------------------------------
        // 1. 定型文リスト（APIを使わないので手動で用意）
        // -----------------------------------------------------------
        const messages = [
          "ねぇ、その変数名なに？浮気？",
          "コード動いたね…でも私の心は動かないよ",
          "エラー出てないけど、私への愛は足りてる？",
          "そんな書き方して...私のこと嫌いなんでしょ？",
          "ずっと見てるからね...ずっと...",
          "私と仕事、どっちが大事なの？",
        ];

        // ランダムに1つ選ぶ
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];

        // -----------------------------------------------------------
        // 2. 表示する場所を決める（今回はカーソルがある行の末尾）
        // -----------------------------------------------------------
        const position = editor.selection.active; // 現在のカーソル位置
        const line = editor.document.lineAt(position.line); // その行の情報を取得

        // 行の「一番最後」を範囲として指定する
        const range = new vscode.Range(line.range.end, line.range.end);

        // -----------------------------------------------------------
        // 3. 装飾データを作成（ここがゴーストテキストの正体）
        // -----------------------------------------------------------
        const decoration: vscode.DecorationOptions = {
          range: range,
          renderOptions: {
            after: {
              // ここに表示したい文字を入れる
              contentText: `  ← ${randomMsg} 🔪`,
            },
          },
        };

        // -----------------------------------------------------------
        // 4. エディタに適用
        // -----------------------------------------------------------
        // ※これを実行すると、前の装飾は消えて新しいのがつきます
        editor.setDecorations(menheraDecorationType, [decoration]);
      } else {
        vscode.window.showErrorMessage(
          "ファイル開いてないじゃん…私のこと無視する気？"
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
