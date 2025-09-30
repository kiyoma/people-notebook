# 人メモ帳 (Local MVP)

顔登録なし・ローカルだけで動く「人メモ帳」MVP。IndexedDB に保存され、Fuse.js で全文風検索が可能。Vite 開発サーバで動作します。

## セットアップ

前提: Node.js 18+ 推奨。

```bash
npm install
npm run dev
```

開発サーバが起動したら、表示された URL にアクセスしてください（例: http://localhost:5173）。

## 操作

- ① 追加フォーム: 名前は必須。他に「どこで会った」「いつ会った」「メモ」「タグ(カンマ区切り)」を入力し「追加」。
- ② 検索: 名前/メモ/どこ/タグを対象に 200ms デバウンスで検索。スコア順に表示、ヒット箇所は簡易ハイライト。
- ③ 結果リスト: 各行に「編集/削除」。編集は行内で保存/キャンセル可能。
- エクスポート: JSON をファイル保存。対応ブラウザは File System Access API、未対応はダウンロードでフォールバック。
- インポート: JSON を読み込み。対応ブラウザはファイルピッカー、未対応は `<input type="file">` でフォールバック。

## 技術構成

- フロントのみ: Vite
- 検索: Fuse.js（keys: name, notes, whereMet, tags / weights: 0.5, 0.3, 0.1, 0.1）
- 保存: IndexedDB（DB: `people`, Store: `entries`, keyPath: `id`）

## プロジェクト構成

- `index.html` UI 本体
- `styles.css` 最小限のスタイル
- `app.js` UI ロジック、検索、編集/削除、入出力
- `db.js` IndexedDB ラッパー（CRUD、エクスポート/インポート）
- `package.json` Vite スクリプト/依存

## ビルド/プレビュー

```bash
npm run build
npm run preview
```

