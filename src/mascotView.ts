import * as vscode from 'vscode';

export class MenheraViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'menhera-ai.mascotView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    // メッセージ更新
    public updateMessage(message: string) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateText', text: message });
        }
    }

    // ▼▼▼ 追加：表情（モード）を変える機能 ▼▼▼
    public updateMood(isAngry: boolean) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateMood', isAngry: isAngry });
        }
    }
    // ▲▲▲▲▲▲

    private _getHtmlForWebview(webview: vscode.Webview) {
        // 通常画像のパス
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'new_menhera_logo.png'));
        // 激怒画像のパス（ここに追加！）
        const angryUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'menhela-first.png'));

        return `<!DOCTYPE html>
        <html lang="ja">
        <head>
            <style>
                body {
                    background-color: #0f0f0f;
                    color: #ff8ce0;
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    padding: 10px;
                    transition: background-color 0.5s; /* 背景色アニメーション */
                }
                .bubble {
                    position: relative;
                    background: #ff69b4;
                    border: 2px solid #ff8ce0;
                    border-radius: 15px;
                    padding: 10px;
                    color: white;
                    font-weight: bold;
                    margin-bottom: 15px;
                    width: 90%;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    font-size: 0.9em;
                }
                .bubble:after {
                    content: '';
                    position: absolute;
                    bottom: -10px;
                    left: 50%;
                    border-width: 10px 10px 0;
                    border-style: solid;
                    border-color: #ff69b4 transparent;
                    transform: translateX(-50%);
                }
                .logo { 
                    width: 100px; 
                    height: auto; 
                    transition: transform 0.2s;
                }
                /* 激怒時のスタイル */
                .angry-mode .logo {
                    transform: scale(1.1);
                    border: 3px solid red;
                    box-shadow: 0 0 15px red;
                }
            </style>
        </head>
        <body>
            <div id="message" class="bubble">ねぇ、ずっとコード書いてるね。私のことも見てよ...</div>
            <img id="mascot-img" class="logo" src="${logoUri}">
            
            <script>
                const messageElement = document.getElementById('message');
                const imgElement = document.getElementById('mascot-img');
                const bodyElement = document.body;

                // 2つの画像のパスを保持
                const normalSrc = "${logoUri}";
                const angrySrc = "${angryUri}";

                window.addEventListener('message', event => {
                    const message = event.data;

                    // テキスト更新
                    if (message.type === 'updateText') {
                        messageElement.innerText = message.text;
                    }

                    // ▼▼▼ 追加：モード切替処理 ▼▼▼
                    if (message.type === 'updateMood') {
                        if (message.isAngry) {
                            // 激怒モード
                            imgElement.src = angrySrc;
                            bodyElement.style.backgroundColor = '#2b0000'; // 背景を赤黒く
                            document.body.classList.add('angry-mode');
                        } else {
                            // 通常モード
                            imgElement.src = normalSrc;
                            bodyElement.style.backgroundColor = '#0f0f0f'; // 元に戻す
                            document.body.classList.remove('angry-mode');
                        }
                    }
                    // ▲▲▲▲▲▲
                });
            </script>
        </body>
        </html>`;
    }
}