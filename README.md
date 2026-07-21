# 散歩コースメーカー_本体

犬同伴OK店（わんグルのデータ）を使って、現在地や地名の周辺にある「犬と一緒に入れるお店」を巡る散歩コースを地図上に提案する静的サイトです。サーバーサイドの処理は持たず、HTML/CSS/JSのみで動作し、GitHub Pagesでそのまま公開できます。

## 主な機能

- 現在地（Geolocation API）または地名検索から、周辺の犬同伴OK店を地図上に表示
- 地名 → 緯度経度の変換は [Nominatim](https://nominatim.org/)（OpenStreetMapのジオコーディングAPI）を利用
- 地図描画は [Leaflet](https://leafletjs.com/) + OpenStreetMapタイル
- 店舗データ・エリアデータをもとに、徒歩圏内で回れる散歩コースを提案

## 技術スタック

- HTML / CSS / JavaScript（バニラJS、ビルドステップなし）
- [Leaflet.js](https://leafletjs.com/) — 地図表示
- [OpenStreetMap](https://www.openstreetmap.org/) — 地図タイル
- [Nominatim](https://nominatim.org/) — 地名検索（ジオコーディング）
- GitHub Pages — ホスティング

## データ

- `data/shops.json` — 犬同伴OK店データ（2,085件）。`id` / `name` / `lat` / `lng` / `address` / `access` / `genre` / `areas`（エリアslugの配列）/ `note` / `url` を含む
  - `note`にある通り、`lat`/`lng`は店舗ページの地図埋め込みの中心座標であり、実際の店舗ピン位置と数十m〜数百mずれる場合がある点に注意
- `data/areas.json` — エリアの階層データ（1,163件）。`id` / `slug` / `name` / `parent`（親エリアのid）で地域の親子関係を表す

いずれも[わんグル（DogNavi）](https://dognavi.com/)由来のデータで配置済み。取得日時は各JSONの`generatedAt`を参照。

## セットアップ

ビルドツールや外部ライブラリのインストールは不要です。ローカルで確認する場合は、簡易HTTPサーバーでルートディレクトリを配信してください（`fetch`でJSONを読み込むため、`file://`で直接開くとCORSエラーになる点に注意）。

```bash
# Python がある場合
python -m http.server 8000

# Node.js がある場合
npx serve .
```

ブラウザで `http://localhost:8000` を開いて確認します。

## 使い方

1. サイトを開くと現在地の使用許可を求められるので許可するか、検索欄に地名を入力する
2. 周辺の犬同伴OK店が地図上にピン表示される
3. ピンを選んで、徒歩で巡れる散歩コースの候補を確認する

## 開発

このプロジェクトはビルドステップを持たない静的サイトのため、専用のテスト/Lint/型チェックツールは導入していません。動作確認はブラウザ上での目視確認（Geolocation・Nominatim検索・地図描画・ルート提案の各機能）を基本とします。

## デプロイ

GitHub Pagesで公開します。`main`ブランチ（または `docs/` ディレクトリ）をPages用ソースに設定してください。APIキーの類は不要（Nominatim/OpenStreetMapは無認証で利用可能な公開API）です。
