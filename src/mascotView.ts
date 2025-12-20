import * as vscode from "vscode";

export class MenheraViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "menhera-ai.mascotView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // VS Codeがビューを表示する準備ができたときに呼ばれる
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  // 外部（extension.ts）からメッセージを更新するためのメソッド
  public updateMessage(message: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: "updateText", text: message });
    }
  }
  //外部から激怒モードに変更するメソッド
  public updateAngryMode(isAngry: boolean) {
    if (this._view) {
      this._view.webview.postMessage({ type: "updateAngry", isAngry: isAngry });
    }
  }
  private _getHtmlForWebview(webview: vscode.Webview) {
    // ロゴ画像のパスを取得
      const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "images",
        "new_menhera_logo.png"
      )
    );
    // const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'new_menhera_logo.png'));
    const angryUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src/assets/images",
        "menhera.png"
      )
    );

    return `<!DOCTYPE html>
        <html lang="ja">
        <head>
            <style>
                html {
                height: 100%;
                }
                body {
                    height: 100%;
                    background-color: transparent;
                    color: #ff8ce0;
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content:center;
                    padding: 10px;
                }
                body.angry .bubble {
                    color: black !important}
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
                
                .mascot-image { width: auto; height: auto;}
                
            </style>
        </head>
        <body>
            <div id="message" class="bubble">ねぇ、ずっとコード書いてるね。私のことも見てよ...</div>
            <img class="mascot-image" id="mascot-image" src="${logoUri}">
            <script>
                const messageElement = document.getElementById('message');
                const imageElement = document.getElementById('mascot-image');

                const logoImgSrc = "${logoUri}";
                const angryImgSrc = "${angryUri}";

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateText') {
                        messageElement.innerText = message.text;
                    }
                    if(message.type === 'updateAngry') {
                        if (message.isAngry) {
                            document.body.classList.add('angry'); 
                            imageElement.src = angryImgSrc;
                        } else {
                            document.body.classList.remove('angry');
                            
                          imageElement.src = logoImgSrc;
                        }

                    }
                });
            </script>
        </body>
        </html>`;
  }
}
