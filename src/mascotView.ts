import * as vscode from 'vscode';

export class MenheraViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'menhera-ai.mascotView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    // VS Codeがビューを表示する準備ができたときに呼ばれる
    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    // 外部（extension.ts）からメッセージを更新するためのメソッド
    public updateMessage(message: string) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateText', text: message });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // ロゴ画像のパスを取得
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', '../src/assets/images/menhera_logo.png'));

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
                .logo { width: 100px; height: auto; }
            </style>
        </head>
        <body>
            <div id="message" class="bubble">ねぇ、ずっとコード書いてるね。私のことも見てよ...</div>
            <img class="logo" src="${logoUri}">
            <script>
                const messageElement = document.getElementById('message');
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateText') {
                        messageElement.innerText = message.text;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}