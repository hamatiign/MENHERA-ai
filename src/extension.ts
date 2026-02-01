import * as vscode from "vscode";
import { MenheraViewProvider } from "./mascotView";
import * as cp from "child_process";
const say = require("say");
const path = require("path");

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

// 🟩 翻訳システムをインポート
import { locales, defaultLocale, Locale } from "./locales";
import { getMenheraTerminalLayout, createColorString } from "./data/terminal";

// conventional commit のリスト
const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+/;

// 🟩 設定から言語データを取得する関数
function getLocale(): Locale {
    const config = vscode.workspace.getConfiguration("menhera-ai");
    const lang = config.get<string>("language", "ja");
    // @ts-ignore
    return locales[lang] || defaultLocale;
}

// --- 起動時刻とタイマー設定（ネスト指摘用） ---
const startupTime = Date.now();
const STARTUP_GRACE_PERIOD = 60 * 1000; // 起動後5分間はネストについて言わない

let lastNestingComplaintTime = 0;
const NESTING_COOLDOWN = 10 * 60 * 1000; // チェック間隔（10分間は静かにする）

// ゴーストテキストの表示設定
let hasPunished = false;
const menheraDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 1em",
    color: "#ff69b4",
    fontStyle: "italic",
    fontWeight: "bold",
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const hoverDecorationType = vscode.window.createTextEditorDecorationType({});

let previousErrorCount = -1;
let morePunished = false;
let stagnationTimeout: NodeJS.Timeout | undefined;

let eyeHideTimer: NodeJS.Timeout | undefined;
let eyeFinalHideTimer: NodeJS.Timeout | undefined;

let eyeStatusBars: vscode.StatusBarItem[] = [];

// ステータスバーに目のアイコンを表示するためのアイテムを作成・取得
function ensureEyeStatusBars() {
  if (eyeStatusBars.length > 0) return eyeStatusBars;
  
  for (let i = 0; i < 30; i++) {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      2000 + i
    );
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    item.color = new vscode.ThemeColor("statusBarItem.errorForeground");
    eyeStatusBars.push(item);
  }
  return eyeStatusBars;
}

// タイピング中にステータスバーに目玉を表示・更新する機能
function showEyeWhileTyping() {
  const items = ensureEyeStatusBars();
  const i18n = getLocale(); // 🟩 言語取得

  // タイピングのたびにメッセージの配置をシャッフル
  items.forEach((item, index) => {
    // 🟩 i18nからメッセージを取得
    const msg = i18n.eyeMessages[(index + Math.floor(Date.now() / 1000)) % i18n.eyeMessages.length];
    item.text = `$(eye) ${msg}`;
    item.show();
  });

  if (eyeHideTimer) { clearTimeout(eyeHideTimer); }
  if (eyeFinalHideTimer) {
    clearTimeout(eyeFinalHideTimer);
    eyeFinalHideTimer = undefined;
  }

  eyeHideTimer = setTimeout(() => {
    items.forEach(item => {
      item.text = "$(eye)";
    });

    eyeFinalHideTimer = setTimeout(() => {
      items.forEach(item => item.hide());
      eyeFinalHideTimer = undefined;
    }, 10000);
  }, 5000);
}

// メンヘラターミナルの管理
let menheraTerminal: vscode.Terminal | undefined;
const writeEmitter = new vscode.EventEmitter<string>();
let isAnimating = false;

// メンヘラターミナルにメッセージを表示する関数
async function showMenheraTerminal(message: string, mood: 'love' | 'anger') {

  const config = vscode.workspace.getConfiguration("menhera-ai");
  const enableTerminal = config.get<boolean>("enableTerminal", true);
  
  if (!enableTerminal) {
    return;
  }
  
  if (!menheraTerminal) {
    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => { },
      close: () => { 
        menheraTerminal = undefined; 
      },
      handleInput: (data) => {
        if (data === '\r') { writeEmitter.fire('\r\n'); }
      }
    };
    menheraTerminal = vscode.window.createTerminal({ name: "Menhera AI", pty });
  }
  menheraTerminal.show(true);

  // アニメーション中は待機
  while (isAnimating) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  isAnimating = true;

  try {
    const theme = mood === 'anger' ? 'spooky' : 'love';
    const border = mood === 'anger' ? 'bamboo' : 'hearts2';
    const layout = getMenheraTerminalLayout(message, theme, border);

    writeEmitter.fire(layout.header.replace(/\n/g, '\r\n'));

    for (const char of layout.body) {
      if (char === '\n') {
        writeEmitter.fire('\r\n');
      } else {
        writeEmitter.fire(createColorString(char, layout.bodyColor, "bold"));
      }
      await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 20));
    }

    writeEmitter.fire(layout.footer.replace(/\n/g, '\r\n'));
    writeEmitter.fire('\r\n\r\n');
  } finally {
    isAnimating = false;
  }
}

// 拡張機能が有効化された時に呼ばれるメイン関数
export async function activate(context: vscode.ExtensionContext) {
  const i18n = getLocale(); // 🟩 言語取得
  console.log(i18n.startup);
  showMenheraTerminal(i18n.startup, 'love'); // 起動時も翻訳

  // マスコット表示（サイドバー）
  const mascotProvider = new MenheraViewProvider(context.extensionUri);
  mascotProvider.setInitialMessage(i18n.mascot.initial); // 🟩 初期メッセージ翻訳
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MenheraViewProvider.viewType,
      mascotProvider,
    ),
  );

  // --- 作業パターン学習・休憩促進機能 ---
  let currentSessionStartTime = Date.now();
  let lastActivityTimestamp = Date.now();
  let workLevelNotified = 0;
  
  const BREAK_IDLE_THRESHOLD = 5 * 60 * 1000; 
  const WORK_LIMIT_1 = 60 * 60 * 1000; 
  const WORK_LIMIT_2 = 2 * 60 * 60 * 1000; 

  // 作業時間をチェックして休憩を促す関数
  const checkWorkSession = () => {
    const now = Date.now();
    
    if (now - lastActivityTimestamp > BREAK_IDLE_THRESHOLD) {
      currentSessionStartTime = now;
      workLevelNotified = 0;
    }
    lastActivityTimestamp = now;

    const sessionDuration = now - currentSessionStartTime;
    const i18n = getLocale(); // 🟩 ここで言語取得

    if (sessionDuration > WORK_LIMIT_2 && workLevelNotified < 2) {
      const msg = i18n.workSession.limit2;
      vscode.window.showWarningMessage(msg);
      mascotProvider.updateMessage(msg);
      showMenheraTerminal(i18n.workSession.limit2_term, 'anger');
      workLevelNotified = 2;
    } else if (sessionDuration > WORK_LIMIT_1 && workLevelNotified < 1) {
      const msg = i18n.workSession.limit1;
      vscode.window.showInformationMessage(msg);
      mascotProvider.updateMessage(msg);
      showMenheraTerminal(i18n.workSession.limit1_term, 'love');
      workLevelNotified = 1;
    }
  };

  // --- 放置検知機能 ---
  let idleTimer: NodeJS.Timeout | undefined;
  let heavyIdleTimer: NodeJS.Timeout | undefined;
  let spamInterval: NodeJS.Timeout | undefined;
  let spamStartTimer: NodeJS.Timeout | undefined;

  // 放置タイマーをリセットし、放置検知時の処理を設定する関数
  const resetIdleTimer = () => {
    if (idleTimer) { clearTimeout(idleTimer); }
    if (heavyIdleTimer) { clearTimeout(heavyIdleTimer); }
    if (spamStartTimer) { clearTimeout(spamStartTimer); }

    const config = vscode.workspace.getConfiguration("menhera-ai");
    const warningTime = config.get<number>("idleThresholdWarning", 60000);
    const spamTime = config.get<number>("idleThresholdSpam", 100000);

    const i18n = getLocale(); // 🟩 言語取得

    // スパムモード解除
    if (spamInterval) {
      clearInterval(spamInterval);
      spamInterval = undefined;
      mascotProvider.updateMood(false);
      const msg = i18n.idle.welcomeBack;
      vscode.window.showInformationMessage(msg);
      mascotProvider.updateMessage(msg);
      showMenheraTerminal(i18n.idle.welcomeBack_term, 'love');
    }

    // 第1段階: 生存確認
    idleTimer = setTimeout(() => {
      const msg = i18n.idle.alive;
      vscode.window.showInformationMessage(msg);
      mascotProvider.updateMessage(msg);
      showMenheraTerminal(i18n.idle.alive_term, 'love');
    }, warningTime);

    // 第2段階: 大量通知（スパム）
    heavyIdleTimer = setTimeout(() => {
      mascotProvider.updateMood(true);
      const spamMessages = i18n.idle.spamList;
      
      showMenheraTerminal(i18n.idle.spam_term, 'anger');
      spamStartTimer = setTimeout(() => {
      spamInterval = setInterval(() => {
        const randomMsg = spamMessages[Math.floor(Math.random() * spamMessages.length)];
        vscode.window.showErrorMessage(randomMsg);
        mascotProvider.updateMessage(randomMsg);
        if (menheraTerminal) {
          writeEmitter.fire(`\r\n> ${randomMsg}\r\n`);
        }
      }, 500);
     }, 3000);
    }, spamTime);
  };

  // 起動時にタイマー開始
  resetIdleTimer();

  // 診断（赤波線）の監視用タイマー
  let timeout: NodeJS.Timeout | undefined = undefined;

  // テキスト変更時のイベントリスナー（タイピング監視）
  const typeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges.length === 0) {
      return;
    }
    showEyeWhileTyping();
    resetIdleTimer();
    checkWorkSession();
  });
  context.subscriptions.push(typeListener);

  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    resetIdleTimer();
    checkWorkSession();
  });
  context.subscriptions.push(selectionListener);

  // エディタの装飾を更新する関数
  const updateDecorations = async (editor: vscode.TextEditor) => {
    if (!editor) { return; }

    const i18n = getLocale(); // 🟩 言語取得

    // 自分が出した手紙には反応しない
    if (
      editor.document.fileName.endsWith(i18n.letter1.filename) ||
      editor.document.fileName.endsWith(i18n.letter2.filename)
    ) {
      return;
    }

    const config = vscode.workspace.getConfiguration("menhera-ai");
    const apiKey = config.get<string>("apiKey");
    const angerThreshold = config.get<number>("angerThreshold", 5);
    const enableVoice = config.get<boolean>("enableVoice", true);
    const checkDelay = config.get<number>("checkDelay", 2000);
    const enableCheckOnEdit = config.get<boolean>("enableCheckOnEdit", true);

    if (!apiKey) { return; }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error,
    );

    // ==========================================
    // 🧹 1. エラーがない時
    // ==========================================
    if (errors.length === 0) {
      editor.setDecorations(menheraDecorationType, []);
      await changeWindowColor(false);
      mascotProvider.updateMood(false);

      if (stagnationTimeout) {
        clearTimeout(stagnationTimeout);
        stagnationTimeout = undefined;
      }

      // 手紙ファイルを削除
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        await cleanupLetterFiles(workspaceFolders[0].uri, i18n); // 🟩 i18nを渡す

        if (hasPunished || morePunished) {
          const msg = i18n.cleanup;
          vscode.window.showInformationMessage(msg);
          mascotProvider.updateMessage(msg);
        }
        hasPunished = false;
        morePunished = false;
      }

      const now = Date.now();

      // ネスト警察
      if ((now - startupTime) >= STARTUP_GRACE_PERIOD && (now - lastNestingComplaintTime) >= NESTING_COOLDOWN) {
        const maxDepth = checkNestingLevel(editor.document);
        const nestLimit = 8; 

        if (maxDepth >= nestLimit) {
          // 🟩 翻訳関数呼び出し
          const msg = i18n.nesting.complaint(maxDepth);
          mascotProvider.updateMessage(msg);
          lastNestingComplaintTime = now;
          return;
        }
      }

      if (previousErrorCount === -1 || previousErrorCount > 0) {
        const msg = i18n.perfect;
        vscode.window.showInformationMessage(msg);
        mascotProvider.updateMessage(msg);
      }
      previousErrorCount = 0;
      return;
    }

    // --- エラーがある場合 ---
    previousErrorCount = errors.length;

    // ==========================================
    // 💀 2. エラー5個以上（お仕置き）
    // ==========================================
    if (errors.length >= angerThreshold) {
      mascotProvider.updateMood(true);
      mascotProvider.updateMessage(i18n.mascot.angry);

      // 🟩 手紙設定を確認
      const enableLetters = config.get<boolean>("enableLetters", true);
      const workspaceFolders = vscode.workspace.workspaceFolders;

      // A. 最初のお仕置き
      if (!hasPunished && workspaceFolders) {
        hasPunished = true;
        await changeWindowColor(true);
        vscode.window.showErrorMessage(i18n.letter1.message);
        showMenheraTerminal(i18n.git.invalidCommit_term("エラー多すぎ..."), 'anger'); // ※メッセージは適宜

        if (enableVoice) {
          const audioPath = path.join(context.extensionPath, "audio", "first-letter-voice-ver2.wav");
          playAudio(audioPath);
        }

        if (enableLetters) {
            runPunishmentLogic(workspaceFolders, i18n.letter1.filename, i18n.letter1.content);
        }
      }

      // B. 追撃タイマー
      if (!stagnationTimeout && !morePunished && workspaceFolders) {
        stagnationTimeout = setTimeout(async () => {
          vscode.window.showErrorMessage(i18n.letter2.message);

          if (enableVoice) {
            const audioPath = path.join(context.extensionPath, "audio", "second-letter-voice.wav");
            playAudio(audioPath);
          }
          if (enableLetters) {
              await runPunishmentLogic(workspaceFolders, i18n.letter2.filename, i18n.letter2.content);
          }
          morePunished = true;
          stagnationTimeout = undefined;
        }, 30000); 
      }
    } else {
      // 5個未満
      mascotProvider.updateMood(false);
      if (stagnationTimeout) {
        clearTimeout(stagnationTimeout);
        stagnationTimeout = undefined;
      }
    }

    if (errors.length < 3) {
      hasPunished = false;
      morePunished = false;
    }

    // エラーメッセージの表示
    const DecorationOptions: vscode.DecorationOptions[] = [];
    const hoverOptions: vscode.DecorationOptions[] = [];
    let sidebarMessage = "";

    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(targetError.range.start.line).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      
      // 🟩 i18nを渡す
      const message = await CreateMessage(targetError, apiKey, i18n);

      if (i === 0) { sidebarMessage = message; }

      hoverOptions.push({ range: targetError.range, hoverMessage: message });
      DecorationOptions.push({
        range: range,
        renderOptions: { after: { contentText: message } },
        hoverMessage: message,
      });
    }

    editor.setDecorations(menheraDecorationType, DecorationOptions);
    editor.setDecorations(hoverDecorationType, hoverOptions);
    if (sidebarMessage) {
      mascotProvider.updateMessage(sidebarMessage);
    }
  };

  // 「Hello World」コマンド
  const helloWorldCommand = vscode.commands.registerCommand(
    "menhera-ai.helloWorld",
    () => {
      const i18n = getLocale(); // 🟩 言語取得
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const messages = i18n.helloWorld;
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        vscode.window.showInformationMessage(randomMsg);
        say.speak(randomMsg, null, 1.0);
      } else {
        const errorMsg = i18n.noFile;
        vscode.window.showErrorMessage(errorMsg);
        say.speak(errorMsg, null, 1.0);
        mascotProvider.updateMood(true);
        mascotProvider.updateMessage(errorMsg);
      }
    },
  );
  context.subscriptions.push(helloWorldCommand);

  // スパム強制発動コマンド
  const triggerSpamCommand = vscode.commands.registerCommand(
    "menheraSpam",
    () => {
      if (idleTimer) { clearTimeout(idleTimer); }
      if (heavyIdleTimer) { clearTimeout(heavyIdleTimer); }
      if (spamStartTimer) { clearTimeout(spamStartTimer); }
      if (spamInterval) { clearInterval(spamInterval); }

      const i18n = getLocale(); // 🟩 言語取得

      mascotProvider.updateMood(true);
      const spamMessages = i18n.idle.spamList;
      
      showMenheraTerminal(i18n.idle.spam_term, 'anger');

      spamStartTimer = setTimeout(() => {
        spamInterval = setInterval(() => {
          const randomMsg = spamMessages[Math.floor(Math.random() * spamMessages.length)];
          vscode.window.showErrorMessage(randomMsg);
          mascotProvider.updateMessage(randomMsg);
          if (menheraTerminal) {
            writeEmitter.fire(`\r\n> ${randomMsg}\r\n`);
          }
        }, 1500);
      }, 1000);
    }
  );
  context.subscriptions.push(triggerSpamCommand);

  // 診断（エラー）変更イベント
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      const config = vscode.workspace.getConfiguration("menhera-ai");
      const enableCheckOnEdit = config.get<boolean>("enableCheckOnEdit", true);
      const checkDelay = config.get<number>("checkDelay", 2000);

      if (enableCheckOnEdit && editor && event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        timeout = setTimeout(() => {
          updateDecorations(editor);
        }, checkDelay);
      }
    },
  );

  const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
    const config = vscode.workspace.getConfiguration("menhera-ai");
    const enableCheckOnSave = config.get<boolean>("enableCheckOnSave", true);

    if (!enableCheckOnSave) { return; }
    
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (editor.document.uri.toString() === document.uri.toString()) {
        updateDecorations(editor);
      }
    });
  });
  context.subscriptions.push(saveDisposable);
  context.subscriptions.push(diagnosticDisposable);

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  };

  // Git拡張機能との連携
  const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
  
  if (gitExtension) {
    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }
    
    const git = gitExtension.exports.getAPI(1);
    console.log("メンヘラAI: Git APIを取得したよ");

    const setupRepo = async (repo: any) => {
      console.log("メンヘラAI: 監視を開始したよ:", repo.rootUri.fsPath);
      
      const getGitLog = (): Promise<{ hash: string, message: string } | null> => {
        return new Promise((resolve) => {
          cp.exec('git log -1 --pretty=format:"%H%n%B"', { cwd: repo.rootUri.fsPath }, (error, stdout) => {
            if (error || !stdout) {
              resolve(null);
              return;
            }
            const lines = stdout.split('\n');
            const hash = lines[0].trim();
            const message = lines.slice(1).join('\n').trim();
            resolve({ hash, message });
          });
        });
      };

      let lastHash: string | undefined;
      const initial = await getGitLog();
      if (initial) {
        lastHash = initial.hash;
      }

      repo.state.onDidChange(async () => {
        const current = await getGitLog();
        if (!current) { return; }

        if (current.hash !== lastHash) {
          lastHash = current.hash;
          const message = current.message;
          const isValid = CONVENTIONAL_COMMIT_REGEX.test(message);
          const i18n = getLocale(); // 🟩 言語取得

          if (!isValid) {
            mascotProvider.updateMood(true);
            const firstLine = message.split('\n')[0];
            
            // 🟩 翻訳版呼び出し
            mascotProvider.updateMessage(i18n.git.invalidCommit(firstLine));
            await changeWindowColor(true);
            vscode.window.showErrorMessage(i18n.git.invalidCommit_toast);
            showMenheraTerminal(i18n.git.invalidCommit_term(firstLine), 'anger');
          } else {
            mascotProvider.updateMood(false);
            await changeWindowColor(false);
          }
        }
      });
    };

    git.repositories.forEach(setupRepo);
    git.onDidOpenRepository(setupRepo);
  }
}

export function deactivate() {
  if (menheraTerminal) {
    menheraTerminal.dispose();
  }
}

// ヘルパー関数たち
const GetJsonKey = (error: vscode.Diagnostic) => {
  const source = error.source ? error.source.toLowerCase() : "unknown";
  let codeString = "unknown";
  if (typeof error.code === "string" || typeof error.code === "number") {
    codeString = String(error.code);
  } else if (typeof error.code === "object" && error.code !== null) {
    codeString = String((error.code as any).value || "unknown");
  }
  return `${source}-${codeString}`;
};

const changeWindowColor = async (isAngry: boolean) => {
  const config = vscode.workspace.getConfiguration();
  if (isAngry) {
    await config.update(
      "workbench.colorCustomizations",
      {
        "editor.background": "#1a0000",
        "activityBar.background": "#8b0000",
        "statusBar.background": "#ff0000",
        "statusBar.foreground": "#ffffff",
        "titleBar.activeBackground": "#8b0000",
      },
      vscode.ConfigurationTarget.Workspace,
    );
  } else {
    await config.update(
      "workbench.colorCustomizations",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }
};

async function typeWriter(editor: vscode.TextEditor, text: string) {
  for (let i = 0; i < text.length; i++) {
    if (editor.document.isClosed) {
      return;
    }
    await editor.edit((editBuilder) => {
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      const endPos = lastLine.range.end;
      editBuilder.insert(endPos, text[i]);
    });
    const randomDelay = Math.floor(Math.random() * 175) + 80;
    await new Promise((resolve) => setTimeout(resolve, randomDelay));
  }
  await editor.document.save();
}

async function runPunishmentLogic(
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  fileName: string,
  content: string,
) {
  const rootPath = workspaceFolders[0].uri;
  const fileUri = vscode.Uri.joinPath(rootPath, fileName);

  try {
    const openedDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === fileUri.toString(),
    );
    let document: vscode.TextDocument;

    if (openedDoc) {
      document = openedDoc;
    } else {
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
      }
      document = await vscode.workspace.openTextDocument(fileUri);
    }

    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });

    await editor.edit((editBuilder) => {
      const lastLine = document.lineAt(document.lineCount - 1);
      const range = new vscode.Range(
        0,
        0,
        lastLine.range.end.line,
        lastLine.range.end.character,
      );
      editBuilder.delete(range);
    });

    await typeWriter(editor, content);
  } catch (e) {
    console.error("お仕置き失敗", e);
  }
}

// 🟩 引数にi18nを追加
async function cleanupLetterFiles(rootPath: vscode.Uri, i18n: Locale) {
  const filesToDelete = [i18n.letter1.filename, i18n.letter2.filename];

  for (const fileName of filesToDelete) {
    const fileUri = vscode.Uri.joinPath(rootPath, fileName);
    try {
      const tabs = vscode.window.tabGroups.all.map((tg) => tg.tabs).flat();
      const targetTab = tabs.find(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.path.endsWith(fileName),
      );

      if (targetTab) {
        await vscode.window.tabGroups.close(targetTab);
      }

      await vscode.workspace.fs.stat(fileUri); // 存在確認
      await vscode.workspace.fs.delete(fileUri, { useTrash: false });
    } catch (e) { }
  }
}

// 🟩 引数にi18nを追加
const CreateMessage = async (
  targetError: vscode.Diagnostic,
  apiKey: string,
  i18n: Locale
): Promise<string> => {
  // 🟩 i18n.responses を使用
  // @ts-ignore
  if (i18n.responses[GetJsonKey(targetError)]) {
     // @ts-ignore
    return i18n.responses[GetJsonKey(targetError)];
  }
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
    },
    async () => {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-flash-latest",
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
        // 🟩 i18n.prompt を使用
        const prompt = `${i18n.prompt}\n\nError Message: "${targetError.message}"`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      } catch (err) {
        return i18n.apiError;
      }
    },
  );
};

// 🔊 画面を出さずに音を再生する関数（Windows/Mac対応）
function playAudio(filePath: string) {
  const safePath = filePath.replace(/\\/g, "\\\\");

  if (process.platform === "win32") {
    const command = `powershell -c (New-Object Media.SoundPlayer '${safePath}').PlaySync()`;
    cp.exec(command, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  } else if (process.platform === "darwin") {
    cp.exec(`afplay "${filePath}"`, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  } else {
    cp.exec(`aplay "${filePath}"`, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  }
}

function checkNestingLevel(document: vscode.TextDocument): number {
  let maxDepth = 0;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;

    if (text.trim() === "" || text.trim().startsWith("//")) {
      continue;
    }

    const indentMatch = text.match(/^(\s*)/);
    const indentLength = indentMatch ? indentMatch[1].length : 0;
    const currentDepth = Math.floor(indentLength / 4);

    if (currentDepth > maxDepth) {
      maxDepth = currentDepth;
    }
  }
  return maxDepth;
}
