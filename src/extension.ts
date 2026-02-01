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
      const
