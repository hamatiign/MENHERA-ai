// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('メンヘラCopilotが起動しました...ずっと見てるからね。');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('menhera-ai.helloWorld', () => {
		const editor = vscode.window.activeTextEditor;
		const messages = [
                'ねぇ、その変数名なに？浮気？',
                'コード動いたね…でも私の心は動かないよ',
                'エラー出てないけど、私への愛は足りてる？',
                'そんな書き方して...私のこと嫌いなんでしょ？'
            ];
			
		const randomMsg = messages[Math.floor(Math.random() * messages.length)];
		vscode.window.showInformationMessage(randomMsg);
	});


	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
