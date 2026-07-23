# 散歩コースメーカー_本体

犬同伴OK店（わんグルのデータ）と公園（OpenStreetMapのデータ）を使って、現在地や地名の周辺で犬と一緒に巡れる散歩コースを地図上に提案する静的サイトです。サーバーサイドの処理は持たず、HTML/CSS/JSのみで動作し、GitHub Pagesでそのまま公開できます。

## 主な機能

- 現在地（Geolocation API）または地名検索から、周辺の犬同伴OK店・公園を地図上に表示
- 地名 → 緯度経度の変換は [Nominatim](https://nominatim.org/)（OpenStreetMapのジオコーディングAPI）を利用
- 地図描画は [Leaflet](https://leafletjs.com/) + OpenStreetMapタイル
- 店舗データ・公園データ・エリアデータをもとに、徒歩圏内で回れる散歩コースを提案（範囲内に両方あれば、公園と店舗を最低1つずつ含める緩い保証つき）

## 技術スタック

- HTML / CSS / JavaScript（バニラJS、ビルドステップなし）
- [Leaflet.js](https://leafletjs.com/) — 地図表示（`vendor/leaflet/`にバージョン1.9.4を同梱。CDNは使わず、外部障害時にも地図が止まらないようにしている）
- [OpenStreetMap](https://www.openstreetmap.org/) — 地図タイル
- [Nominatim](https://nominatim.org/) — 地名検索（ジオコーディング）
- GitHub Pages — ホスティング
- Node.js — 開発・テスト時のみ使用（`node --test`でコース生成ロジックを単体テスト）。本番の配信物はNode不要な静的ファイルのみ

## データ

- `data/shops.json` — 犬同伴OK店データ（2,085件、[わんグル（DogNavi）](https://dognavi.com/)由来）。`id`(数値) / `name` / `lat` / `lng` / `address` / `access` / `genre` / `areas`（エリアslugの配列）/ `note` / `url` を含む
  - `note`にある通り、`lat`/`lng`は店舗ページの地図埋め込みの中心座標であり、実際の店舗ピン位置と数十m〜数百mずれる場合がある点に注意
  - 犬同伴可否は確認済みのデータ
- `data/parks.json` — 公園データ（5,607件、OpenStreetMap由来）。`id`(文字列。例:`"way/18622557"`。OpenStreetMapの要素IDと一致し、`https://www.openstreetmap.org/{id}`でそのページを開ける) / `name` / `lat` / `lng` / `areaHa`（面積。一部`null`あり） / `prefecture` などを含む
  - **犬の同伴可否はOSMのデータに含まれておらず未確認**。公園によっては犬の持ち込みを禁止している場合があるため、UI上で「犬の同伴可否は各公園にご確認ください」と明示している
- `data/areas.json` — エリアの階層データ（1,163件）。`id` / `slug` / `name` / `parent`（親エリアのid）で地域の親子関係を表す（v1では未使用）

取得日時は各JSONの`generatedAt`を参照（`parks.json`のみ配列直下でメタ情報を持たない）。

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

1. 「現在地から探す」ボタンを押して位置情報の利用を許可するか、検索欄に地名・駅名を入力して検索する
2. 出発地点から半径2km(見つからなければ5km→10kmと自動拡大)以内の犬同伴OK店・公園をもとに、徒歩で巡れる散歩コース(2〜4スポット、番号つきピン+線)が自動的に地図とカード一覧に表示される。範囲内に店舗・公園の両方があれば、最低1つずつ含める(無理に探しには行かない緩い保証)
3. 周辺に1件しか無い場合は単体紹介、1件も無い場合はその旨が表示される（いずれも直線距離ベースの「目安」であることを明記）
4. 店舗カードは「詳しくは→わんグル」、公園カードは「OpenStreetMapで見る」からそれぞれ詳細ページへ移動できる。公園カードには「犬の同伴可否は各公園にご確認ください」の注記がある

## 開発

ビルドステップを持たない静的サイトです。コース生成ロジック（距離計算・数珠つなぎ・重複除外・範囲自動拡張など、`js/route.js`の純粋関数）は`node --test`でテストしています。

```bash
node --test js/route.test.js
```

UI部分（地図描画・Geolocation・Nominatim検索・レイアウト）は専用のLint/型チェックツールを導入しておらず、ブラウザ上での目視確認を基本とします。

## デプロイ

GitHub Pagesで公開します。`main`ブランチ（または `docs/` ディレクトリ）をPages用ソースに設定してください。APIキーの類は不要（Nominatim/OpenStreetMapは無認証で利用可能な公開API）です。
