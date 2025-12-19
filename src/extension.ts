import * as vscode from 'vscode';
const say = require('say');
const path = require('path'); // ▼ パス操作のために追加

export function activate(context: vscode.ExtensionContext) {

    console.log('メンヘラCopilotが起動しました...ずっと見てるらね…');

    const disposable = vscode.commands.registerCommand('menhera-ai.helloWorld', () => {
        
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            // 通常時
            const messages = [
                'ねぇ、その変数名なに？浮気？',
                'コード動いたね…でも私の心は動かないよ',
                'エラー出てないけど、私への愛は足りてる？'
            ];
            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
            
            vscode.window.showInformationMessage(randomMsg);
            say.speak(randomMsg, null, 1.0);

        } else {
            // --- エラー時（ファイルを開いていない＝無視されている！） ---
            
            const errorMsg = 'ファイル開いてないじゃん…私のこと無視する気？信じられない...';
            
            // 1. エラーメッセージを出しつつ読み上げ
            vscode.window.showErrorMessage(errorMsg);
            say.speak(errorMsg, null, 1.0);

            // 2. ▼ 画像を表示するパネルを作成（ここが追加部分！）
            const panel = vscode.window.createWebviewPanel(
                'menheraAngry', // 内部的なID
                '激怒中',       // タブに表示されるタイトル
                vscode.ViewColumn.Two, // 右側のカラムに表示（Two）
                {}
            );

            // 3. 画像パスをWebview用に変換
            // ディスク上のパスを取得
            const onDiskPath = vscode.Uri.file(
                path.join(context.extensionPath, 'images', 'menhela-first.png')
            );
            // Webviewで使える形式(vscode-resource:...)に変換
            const imageUri = panel.webview.asWebviewUri(onDiskPath);

            // 4. HTMLを設定して画像を表示
            panel.webview.html = getWebviewContent(imageUri, errorMsg);
        }
    });

    context.subscriptions.push(disposable);
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
                background-color: #2b0000; /* 背景を赤黒くして恐怖感を演出 */
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify_content: center;
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