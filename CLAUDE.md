# CLAUDE.md

## プロジェクトの目的

犬同伴OK店（わんグルのデータ）をもとに、現在地や地名の周辺で犬と一緒に入れるお店を巡る散歩コースを地図上に提案する静的サイト。サーバーサイド処理なし、GitHub Pagesでの公開を前提とする。

## 技術スタック / 主要ライブラリ

- HTML / CSS / JavaScript（バニラJS、フレームワーク・ビルドツールなし）
- Leaflet.js — 地図描画（CDN読み込み想定）
- OpenStreetMap — 地図タイル
- Nominatim — 地名検索（ジオコーディングAPI）
- Geolocation API（ブラウザ標準）— 現在地取得

## ディレクトリ構成の方針

```
data/
  shops.json   # 犬同伴OK店データ（2,085件、配置済み・編集不要）
  areas.json   # エリア階層データ（1,163件、配置済み・編集不要）
index.html     # エントリーポイント
css/           # スタイル
js/            # アプリケーションロジック
```

- `data/`配下のJSONは既存データであり、原則として書き換えない（スキーマは[README.md](README.md)参照）
- ビルドステップを持たないため、GitHub Pagesでそのまま配信できる構成を維持する

## コーディング規約

- ES modules（`<script type="module">`）を基本とし、外部フレームワークは導入しない
- インデントは2スペース、文字コードはUTF-8、改行はLF（`.editorconfig`参照）
- DOM操作・地図初期化・データ取得（fetch）は関数単位で分離し、グローバル変数を増やさない

## よく使うコマンド

```bash
# ローカルプレビュー（fetchでJSONを読むため簡易サーバー経由で開く）
python -m http.server 8000
# または
npx serve .
```

専用のテスト/Lint/型チェックツールは未導入。動作確認はブラウザでの目視確認が基本（Geolocation取得・Nominatim検索・地図描画・散歩コース提案の一連の流れ）。

## 注意事項

- `.env`は読まない・コミットしない（本プロジェクトはNominatim/OpenStreetMap/Geolocationのみを使い、APIキーは不要）
- Nominatimの利用ポリシー上、リクエストは1秒間に1回程度に抑え、過度な連続リクエストを避ける
- 地図・データの出典表示（OpenStreetMapの著作権表示、わんグル由来である旨）を画面上に残す
- `data/shops.json`の`note`にある通り、店舗の`lat`/`lng`は店舗ページの地図埋め込み中心座標であり、実際のピン位置とずれる場合がある前提でUIを設計する

※ コードが揃ったら `/init` で本ファイルを更新・拡充できます。
