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
import { MENHERA_PROMPT } from "./prompt";
import responsesData from "./data/responses.json";
import { getMenheraTerminalLayout, createColorString } from "./data/terminal";

function getLocale(): Locale {
    const config = vscode.workspace.getConfiguration("menhera-ai");
    const lang = config.get<string>("language", "ja");
    // @ts-ignore
    return locales[lang] || defaultLocale;
}



// conventional commit のリスト
const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+/;

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
const MESSAGES = [
  "みてるよ", "ずっといっしょ", "どこにいるの", "ねぇ", "逃がさない", 
  "愛してる", "なにしてるの？", "しってるよ", "あいたい", "どこ？", 
  "みて", "ひとり？", "だれといるの", "なんで返事してくれないの？",
  "みてるからね", "みてる", "さびしい", "なにやってんの？"
];

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

  const i18n = getLocale();

  // タイピングのたびにメッセージの配置をシャッフル（点滅ではなく、内容が入れ替わる程度）
  items.forEach((item, index) => {
    const msg = MESSAGES[(index + Math.floor(Date.now() / 1000)) % i18n.eyeMessages.length];
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
  if (!menheraTerminal) {
    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        // ターミナルが開いた瞬間の処理は特になし
        // showMenheraTerminalが呼ばれたタイミングで出力する
      },
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
  const i18n = getLocale();
  console.log(i18n.startup);
  showMenheraTerminal("メンヘラAIが起動しました...\nずっと見てるからね。", 'love');

  // マスコット表示（サイドバー）
  const mascotProvider = new MenheraViewProvider(context.extensionUri);
  mascotProvider.setInitialMessage(i18n.mascot.initial);
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
  // 5分以上の放置で「休憩した」とみなしてセッションリセット
  const BREAK_IDLE_THRESHOLD = 5 * 60 * 1000; 
  // 1時間、2時間で警告
  const WORK_LIMIT_1 = 60 * 60 * 1000; 
  const WORK_LIMIT_2 = 2 * 60 * 60 * 1000; 

  // 作業時間をチェックして休憩を促す関数
  const checkWorkSession = () => {
    const i18n = getLocale();
    const now = Date.now();
    
    // 休憩判定（前回の操作から一定時間経過していたらリセット）
    if (now - lastActivityTimestamp > BREAK_IDLE_THRESHOLD) {
      currentSessionStartTime = now;
      workLevelNotified = 0;
    }
    lastActivityTimestamp = now;

    const sessionDuration = now - currentSessionStartTime;

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

  const IDLE_THRESHOLD_1 = 10 * 1000; 
  const IDLE_THRESHOLD_2 = 20 * 1000; 

  // 放置タイマーをリセットし、放置検知時の処理を設定する関数
  const resetIdleTimer = () => {
    if (idleTimer) { clearTimeout(idleTimer); }
    if (heavyIdleTimer) { clearTimeout(heavyIdleTimer); }
    if (spamStartTimer) { clearTimeout(spamStartTimer); }

    const i18n = getLocale();

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
    }, IDLE_THRESHOLD_1);

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
    }, IDLE_THRESHOLD_2);
  };

  // 起動時にタイマー開始
  resetIdleTimer();

  // 診断（赤波線）の監視用タイマー
  let timeout: NodeJS.Timeout | undefined = undefined;

  // テキスト変更時のイベントリスナー（タイピング監視）
  const typeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    // 変更内容がない場合は無視
    if (event.contentChanges.length === 0) {
      return;
    }
    // 入力中だけ、エディタに干渉しない場所(ステータスバー右側)に目を表示
    showEyeWhileTyping();
    resetIdleTimer();
    checkWorkSession();
  });
  context.subscriptions.push(typeListener);

  // カーソル移動や選択範囲変更も操作とみなす
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    resetIdleTimer();
    checkWorkSession();
  });
  context.subscriptions.push(selectionListener);

  // エディタの装飾（ゴーストテキストやメンヘラメッセージ）を更新する関数
  const updateDecorations = async (editor: vscode.TextEditor) => {

    if (!editor) {
      return;
    }
    const i18n = getLocale();
    // 自分が出した手紙（と追撃手紙）には反応しないようにする
if (editor.document.fileName.endsWith(i18n.letter1.filename) || 
    editor.document.fileName.endsWith(i18n.letter2.filename)) {
    return;
        }

    const config = vscode.workspace.getConfiguration("menhera-ai");
    const apiKey = config.get<string>("apiKey");
    const angerThreshold = config.get<number>("angerThreshold", 5);
    const enableVoice = config.get<boolean>("enableVoice", true);
    const checkDelay = config.get<number>("checkDelay", 2000); // デフォルト2秒
    const enableCheckOnEdit = config.get<boolean>("enableCheckOnEdit", true);

    if (!apiKey) {
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error,
    );

    // ==========================================
    // 🧹 1. エラーがない時（お掃除＆ご機嫌タイム）
    // ==========================================
    if (errors.length === 0) {
      editor.setDecorations(menheraDecorationType, []);
      await changeWindowColor(false);

      // ★マスコットを通常モードに戻す
      mascotProvider.updateMood(false);

      if (stagnationTimeout) {
        clearTimeout(stagnationTimeout);
        stagnationTimeout = undefined;
      }

      // 手紙ファイルを削除する処理
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
      await cleanupLetterFiles(workspaceFolders[0].uri, i18n);

        // 激怒後なら「許してあげる」メッセージ
        if (hasPunished || morePunished) {
                vscode.window.showInformationMessage(i18n.cleanup); // 翻訳
                mascotProvider.updateMessage(i18n.cleanup);
        }
        // フラグをリセット
        hasPunished = false;
        morePunished = false;
      }

      const now = Date.now();

      // 条件: 「起動直後ではない」 かつ 「前回の指摘から時間が経っている」 場合のみチェック
      if ((now - startupTime) >= STARTUP_GRACE_PERIOD && (now - lastNestingComplaintTime) >= NESTING_COOLDOWN) {

        // ヘルパー関数で深さを計測
        const maxDepth = checkNestingLevel(editor.document);
        const nestLimit = 8; // 指定階層以上で指摘

        if (maxDepth >= nestLimit) {
          const msg = i18n.nesting.complaint(maxDepth);
          mascotProvider.updateMessage(msg);

          // ネストのチェックの時間を更新し、しばらくは静かにさせる
          lastNestingComplaintTime = now;

          return;
        }
      }
      // ---------------------------------------------------------

      if (previousErrorCount === -1 || previousErrorCount > 0) {
        const msg = i18n.perfect;
        vscode.window.showInformationMessage(msg);
        mascotProvider.updateMessage(msg);
      }
      previousErrorCount = 0;
      return;
    }

    // --- エラーがある場合の処理 ---
    previousErrorCount = errors.length;

    // ==========================================
    // 💀 2. エラー5個以上（お仕置き＆追撃セット） => ユーザーが変更できるように(初期値は5のまま)
    // ==========================================
    if (errors.length >= angerThreshold) {
      // ★サイドバーを「激怒モード」にする！
      mascotProvider.updateMood(true);
      mascotProvider.updateMessage(i18n.mascot.angry
      );

      const workspaceFolders = vscode.workspace.workspaceFolders;

      // A. 最初のお仕置き（即時発動）
      if (!hasPunished && workspaceFolders) {
        hasPunished = true;
        await changeWindowColor(true);
        vscode.window.showErrorMessage(i18n.letter1.message);
        showMenheraTerminal("エラー多すぎ...\n私のこと嫌いなの？", 'anger');

        if (enableVoice) {
          const audioPath = path.join(
            context.extensionPath,
            "audio",
            "first-letter-voice-ver2.wav",
          );
          playAudio(audioPath);
        }

        runPunishmentLogic(
          workspaceFolders, i18n.letter1.filename, i18n.letter1.content);
      }

      // B. 追撃タイマー
      if (!stagnationTimeout && !morePunished && workspaceFolders) {
        stagnationTimeout = setTimeout(async () => {
          vscode.window.showErrorMessage(i18n.letter2.message);
          if (enableVoice) {
            const audioPath = path.join(
              context.extensionPath,
              "audio",
              "second-letter-voice.wav",
            );
            playAudio(audioPath);
          }
          await runPunishmentLogic(workspaceFolders, i18n.letter2.filename, i18n.letter2.content);
          morePunished = true;
          stagnationTimeout = undefined;
        }, 30000); // 30秒後
      }
    } else {
      // 5個未満になったら通常モードに戻してあげる
      mascotProvider.updateMood(false);

      // 追撃タイマー解除
      if (stagnationTimeout) {
        clearTimeout(stagnationTimeout);
        stagnationTimeout = undefined;
      }
    }

    // エラーが減ったら（例えば3個以下になったら）許してあげる
    if (errors.length < 3) {
      hasPunished = false;
      morePunished = false;
    }

    // ゴーストテキスト表示
    const DecorationOptions: vscode.DecorationOptions[] = [];
    const hoverOptions: vscode.DecorationOptions[] = [];

    let sidebarMessage = "";
    for (let i = 0; i < errors.length; i++) {
      const targetError = errors[i];
      const EndOfErrorLine = editor.document.lineAt(
        targetError.range.start.line,
      ).range.end;
      const range = new vscode.Range(EndOfErrorLine, EndOfErrorLine);
      const message = await CreateMessage(targetError, apiKey, i18n);

      if (i === 0) {
        sidebarMessage = message;
      }

      hoverOptions.push({
        range: targetError.range, // エラーの範囲（赤波線の場所）を指定
        hoverMessage: message     // 同じメッセージを設定
      });

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

  // 「Hello World」コマンド（メンヘラ挨拶）
  const helloWorldCommand = vscode.commands.registerCommand(
    "menhera-ai.helloWorld",
    () => {
      const i18n = getLocale();
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

  // 放置演出（スパムモード）を強制的に発動するコマンド
  const triggerSpamCommand = vscode.commands.registerCommand(
    "menheraSpam",
    () => {
      // 既存のタイマーをリセットして重複を防ぐ
      if (idleTimer) { clearTimeout(idleTimer); }
      if (heavyIdleTimer) { clearTimeout(heavyIdleTimer); }
      if (spamStartTimer) { clearTimeout(spamStartTimer); }
      if (spamInterval) { clearInterval(spamInterval); }

      // スパムモード開始
      mascotProvider.updateMood(true);
      const spamMessages = ["ねぇ", "どこ？", "無視？", "ねぇねぇ", "おーい", "死んじゃったの？", "捨てられた？", "返事して", "ねぇってば"];
      
      showMenheraTerminal("ねぇ...無視しないでよ...\nどこに行っちゃったの？", 'anger');

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

  // 診断（エラー）変更イベントの監視
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      const editor = vscode.window.activeTextEditor;
      const config = vscode.workspace.getConfiguration("menhera-ai");
      const enableCheckOnEdit = config.get<boolean>("enableCheckOnEdit", true);
      const checkDelay = config.get<number>("checkDelay", 2000);

      if (enableCheckOnEdit &&
        editor &&
        event.uris.some(
          (uri) => uri.toString() === editor.document.uri.toString(),
        )
      ) {
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

// Git拡張機能との連携（コミットメッセージ監視）
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

      // リポジトリの状態（HEADの移動など）が変わるたびに呼ばれる
      repo.state.onDidChange(async () => {
        const current = await getGitLog();
        if (!current) { return; }

        if (current.hash !== lastHash) {

          lastHash = current.hash;
          const message = current.message;

          const isValid = CONVENTIONAL_COMMIT_REGEX.test(message);

          const i18n = getLocale();
          // 判定
          if (!isValid) {
            mascotProvider.updateMood(true);
            const firstLine = message.split('\n')[0];
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

// 拡張機能が無効化された時の処理
export function deactivate() {
  if (menheraTerminal) {
    menheraTerminal.dispose();
  }
}

// ヘルパー関数たち
// エラー情報からJSONのキーを生成する
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

// VSCodeのウィンドウカラーを変更する（激怒モード用）
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

// エディタにタイプライター風に文字を入力する演出
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

// お仕置きロジック（新しいファイルを作成してメッセージを書き込む）
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

// メンヘラAIが生成した手紙ファイルを削除し、タブを閉じるクリーンアップ処理
async function cleanupLetterFiles(rootPath: vscode.Uri) {
  const filesToDelete = ["私からの手紙.txt", "まだ直さないの.txt"];

  for (const fileName of filesToDelete) {
    const fileUri = vscode.Uri.joinPath(rootPath, fileName);
    try {
      // 1. 開いているタブを探して閉じる
      const tabs = vscode.window.tabGroups.all.map((tg) => tg.tabs).flat();
      const targetTab = tabs.find(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.path.endsWith(fileName),
      );

      if (targetTab) {
        await vscode.window.tabGroups.close(targetTab);
      }

      // 2. ファイルを物理削除
      await vscode.workspace.fs.stat(fileUri); // 存在確認
      await vscode.workspace.fs.delete(fileUri, { useTrash: false });
    } catch (e) {
      // ファイルがない場合は無視
    }
  }
}

// Gemini APIを使用してエラーメッセージに対するメンヘラな反応を生成する
const CreateMessage = async (
  targetError: vscode.Diagnostic,
  apiKey: string,
  i18n: Locale
): Promise<string> => {
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
  // ファイルパスのバックスラッシュを修正（Windows用）
  const safePath = filePath.replace(/\\/g, "\\\\");

  if (process.platform === "win32") {
    // Windows: PowerShellを使って裏で再生（画面は出ません！）
    const command = `powershell -c (New-Object Media.SoundPlayer '${safePath}').PlaySync()`;
    cp.exec(command, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  } else if (process.platform === "darwin") {
    // Mac: afplayコマンド
    cp.exec(`afplay "${filePath}"`, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  } else {
    // Linux: aplay (環境による)
    cp.exec(`aplay "${filePath}"`, (error) => {
      if (error) {
        console.error("再生エラー:", error);
      }
    });
  }
}

// ネストの深さをチェックする関数
function checkNestingLevel(document: vscode.TextDocument): number {
  let maxDepth = 0;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;

    // 空行やコメント行(//)は無視
    if (text.trim() === "" || text.trim().startsWith("//")) {
      continue;
    }

    // 行頭の空白文字を取得
    const indentMatch = text.match(/^(\s*)/);
    const indentLength = indentMatch ? indentMatch[1].length : 0;

    // スペース4つ（またはタブ1つ）を1階層として計算
    // ※スペース2つで1階層の環境なら / 2 に変更してください
    const currentDepth = Math.floor(indentLength / 4);

    if (currentDepth > maxDepth) {
      maxDepth = currentDepth;
    }
  }
  return maxDepth;
}
