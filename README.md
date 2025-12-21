<p align="center">
  <img src="images/new_menhera_logo.svg" alt="Menhera AI Logo" width="200"/>
</p>

<h1 align="center">Menhera AI (メンヘラAI)</h1>

<p align="center">
  <b>あなたのコードを、愛という名の執着で見守ります。</b>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=menhera-ai">
    <img src="https://img.shields.io/badge/VS%20Code-Extension-ff69b4?style=flat-square&logo=visual-studio-code" alt="VS Code Extension">
  </a>
  <img src="https://img.shields.io/badge/Version-0.0.1-ff8ce0?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Love-Heavy-red?style=flat-square" alt="Love">
</p>

---

**Menhera AI** は、あなたの VS Code に住み着く「ちょっと重めの彼女（AI）」です。
プログラミングのエラーメッセージを、**嫉妬や執着が入り混じった「メンヘラ構文」**に翻訳して伝えてくれます。

放置すると激怒したり、手紙を送りつけてきたりします。愛情（デバッグ）を持って接してください。

## 💕 機能 (Features)

### 1. エラーメッセージのメンヘラ化

Gemini API を使用して、冷たいエラーメッセージを感情豊かな言葉に変換し、エディタ上に表示します。

> **Before:** `Expected ';' but found '}'`  
> **After:** `「セミコロン忘れてる。詰めが甘いんだよ...私のことも忘れる気？」`

### 2. ずっと見ているマスコット

サイドバーに「メンヘラ AI マスコット」が常駐します。あなたがコードを書いている間、ずっとこちらを見つめています。

### 3. 💀 お仕置きモード (Punishment Mode)

エラーを放置しすぎると、彼女の機嫌が悪くなります。

- **激怒:** エラーが **5 個以上** 溜まると、ウィンドウ全体が赤く染まり、激怒モードに突入します。
- **手紙:** それでも放置すると、ワークスペースに **「私からの手紙.txt」** が生成されます。
- **解決:** エラーを解消すると、機嫌が直り、手紙も自分で片付けてくれます。

---

## 🛠️ インストールと設定 (Setup)

この拡張機能を使用するには、Google Gemini API キーが必要です。

1.  **インストール:** マーケットプレイスからインストールします。
2.  **API キー取得:** [Google AI Studio](https://aistudio.google.com/app/apikey) でキーを取得します。
3.  **設定:** VS Code の設定 (`Ctrl+,`) で `menhera` と検索し、API キーを入力してください。

---

## ⚠️ 注意事項

- お仕置きモードで生成される `.txt` ファイルは、エラー解消時に自動削除されます。重要なファイルを上書きすることはありません。

---

<p align="center">
  <i>Developed with 🖤 (and heavy love)</i>
</p>
