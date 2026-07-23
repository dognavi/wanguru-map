import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  haversineDistanceKm,
  sanitizeLocations,
  dedupeByExactCoordinate,
  findShopsWithAutoExpandingRadius,
  estimateWalkingMinutes,
  findNearbyShops,
} from "./route.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRealShops() {
  const raw = readFileSync(path.join(__dirname, "..", "data", "shops.json"), "utf-8");
  return JSON.parse(raw).shops;
}

describe("haversineDistanceKm", () => {
  test("東京駅↔新宿駅は約6.134kmになる(実測値で検算)", () => {
    const tokyoStation = { lat: 35.681236, lng: 139.767125 };
    const shinjukuStation = { lat: 35.690921, lng: 139.700258 };
    const distance = haversineDistanceKm(tokyoStation, shinjukuStation);
    assert.ok(
      Math.abs(distance - 6.134) < 0.01,
      `expected ~6.134km, got ${distance}`,
    );
  });

  test("東京駅↔横浜駅は約27.280kmになる(実測値で検算・より長い距離のケース)", () => {
    const tokyoStation = { lat: 35.681236, lng: 139.767125 };
    const yokohamaStation = { lat: 35.465981, lng: 139.622402 };
    const distance = haversineDistanceKm(tokyoStation, yokohamaStation);
    assert.ok(
      Math.abs(distance - 27.28) < 0.05,
      `expected ~27.280km, got ${distance}`,
    );
  });

  test("同一地点なら距離は0になる", () => {
    const point = { lat: 35.0, lng: 139.0 };
    assert.equal(haversineDistanceKm(point, point), 0);
  });

  test("緯度経度を取り違えると異なる距離になる(引数の順序が重要)", () => {
    // 東京駅と、緯度経度を意図的に入れ替えた"偽の東京駅"の距離は 0 にならないはず
    const tokyoStation = { lat: 35.681236, lng: 139.767125 };
    const swapped = { lat: tokyoStation.lng, lng: tokyoStation.lat };
    const distance = haversineDistanceKm(tokyoStation, swapped);
    assert.ok(distance > 1000, `swapped coordinates should be very far apart, got ${distance}km`);
  });
});

describe("sanitizeLocations", () => {
  test("NaN・範囲外座標の店を除外し、正常な店だけ残す", () => {
    const shops = [
      { id: 1, lat: 35.0, lng: 139.0 },
      { id: 2, lat: NaN, lng: 139.0 },
      { id: 3, lat: 35.0, lng: 999 },
      { id: 4, lat: 91, lng: 139.0 },
      { id: 5, lat: -35.0, lng: -139.0 },
    ];
    const result = sanitizeLocations(shops);
    assert.deepEqual(result.map((s) => s.id), [1, 5]);
  });

  test("実データ(data/shops.json)は全件が有効な座標を持つ(欠損0件を確認済み)", () => {
    const shops = loadRealShops();
    const result = sanitizeLocations(shops);
    assert.equal(result.length, shops.length);
  });
});

describe("dedupeByExactCoordinate", () => {
  test("完全一致座標をグループ化し、id最小を代表として残す", () => {
    const shops = [
      { id: 10, lat: 35.0, lng: 139.0 },
      { id: 2, lat: 35.0, lng: 139.0 },
      { id: 3, lat: 36.0, lng: 140.0 },
    ];
    const { representatives, duplicatesByRepId } = dedupeByExactCoordinate(shops);
    assert.deepEqual(representatives.map((s) => s.id), [2, 3]);
    assert.deepEqual(duplicatesByRepId.get(2).map((s) => s.id), [10]);
    assert.equal(duplicatesByRepId.has(3), false);
  });

  test("実データで重複除外後の件数が2085件→2048件になる(37組=74店の重複を確認済み・コピペ地図対策)", () => {
    const shops = loadRealShops();
    assert.equal(shops.length, 2085);
    const { representatives } = dedupeByExactCoordinate(shops);
    assert.equal(representatives.length, 2048);
  });
});

describe("findShopsWithAutoExpandingRadius", () => {
  test("半径内に1件でもあれば、そこで拡張を止める(緩い保証)", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 }, // 約0.11km(2km圏内)
      { id: 2, lat: 35.1, lng: 139.0 }, // 約11km(2km圏外)
    ];
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.equal(radiusUsedKm, 2);
    assert.deepEqual(
      found.map((entry) => entry.shop.id),
      [1],
    );
  });

  test("距離昇順・同点はid昇順でソートされる(タイブレークの決定性)", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [
      { id: 5, lat: 0.01, lng: 0 },
      { id: 2, lat: 0.01, lng: 0 }, // id=5と同一距離だが、idが小さい
      { id: 9, lat: 0.005, lng: 0 },
    ];
    const { shops: found } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.deepEqual(
      found.map((entry) => entry.shop.id),
      [9, 2, 5],
    );
  });

  test("上限(100km)まで拡張しても0件なら、0件で返す", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 40.0, lng: 150.0 }]; // 100km圏外の遠方
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.equal(radiusUsedKm, 100);
    assert.equal(found.length, 0);
  });

  test("実データ: 本土の僻地(北海道 羅臼町・知床、最寄り店まで約85.8km)でも上限100km以内に見つかる", () => {
    const shops = loadRealShops();
    const rausu = { lat: 44.0742, lng: 145.2861 };
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(rausu, shops);
    assert.equal(radiusUsedKm, 100);
    assert.ok(found.length >= 1, "羅臼町から100km以内に最低1件は見つかるはず");
  });
});

describe("estimateWalkingMinutes", () => {
  test("分速80mで概算する(1km=1000m/80m=12.5分)", () => {
    assert.equal(estimateWalkingMinutes(1), 12.5);
  });

  test("距離0なら時間も0", () => {
    assert.equal(estimateWalkingMinutes(0), 0);
  });
});

describe("findNearbyShops", () => {
  test("候補が0件ならshops:[]・radiusUsedKmは上限(100km)になる", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 40.0, lng: 150.0 }]; // 100km圏外
    const result = findNearbyShops(origin, shops);
    assert.deepEqual(result.shops, []);
    assert.equal(result.radiusUsedKm, 100);
    assert.equal(result.totalFound, 0);
  });

  test("近い順にソートされる", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [
      { id: 1, lat: 0.003, lng: 0 },
      { id: 2, lat: 0.001, lng: 0 },
      { id: 3, lat: 0.002, lng: 0 },
    ];
    const result = findNearbyShops(origin, shops);
    assert.deepEqual(
      result.shops.map((s) => s.shop.id),
      [2, 3, 1],
    );
  });

  test("既定のmaxResults(20件)を超える分は切り捨てられる", () => {
    const origin = { lat: 0, lng: 0 };
    // 全て2km圏内(0.0001度≒11m間隔、25件で合計約0.27km)に収め、
    // 半径自動拡張の打ち切りがmaxResultsの検証に干渉しないようにする
    const shops = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      lat: 0.0001 * (i + 1),
      lng: 0,
    }));
    const result = findNearbyShops(origin, shops);
    assert.equal(result.shops.length, 20);
    assert.equal(result.totalFound, 25);
    // 近い順の先頭20件(id 1〜20)が返るはず
    assert.deepEqual(
      result.shops.map((s) => s.shop.id),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  test("半径内に1件でもあれば、それ以上広げない(店が多いエリアでも近場だけを返す)", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 }, // 2km圏内
      { id: 2, lat: 35.05, lng: 139.0 }, // 2km圏外(約5.6km)
    ];
    const result = findNearbyShops(origin, shops);
    assert.equal(result.radiusUsedKm, 2);
    assert.deepEqual(
      result.shops.map((s) => s.shop.id),
      [1],
    );
  });

  test("同座標グループの重複店は、代表店のnearbyDuplicatesにのみ現れる", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 },
      { id: 2, lat: 35.001, lng: 139.0 }, // id=1と同座標の重複店
    ];
    const result = findNearbyShops(origin, shops);
    assert.equal(result.shops.length, 1);
    assert.deepEqual(
      result.shops[0].nearbyDuplicates.map((s) => s.id),
      [2],
    );
  });

  test("distanceKm・minutesが各店に付与される", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [{ id: 1, lat: 0.009, lng: 0 }]; // 約1.0km
    const result = findNearbyShops(origin, shops);
    assert.ok(Math.abs(result.shops[0].distanceKm - 1.0) < 0.01);
    assert.ok(Math.abs(result.shops[0].minutes - 12.5) < 0.2);
  });

  test("実データ(渋谷)から現実的な出力が得られる", () => {
    const shops = loadRealShops();
    const shibuyaStation = { lat: 35.658034, lng: 139.701636 };
    const result = findNearbyShops(shibuyaStation, shops);
    assert.ok(result.shops.length > 0);
    assert.ok(result.shops.length <= 20);
    // 近い順になっていることを確認
    for (let i = 1; i < result.shops.length; i++) {
      assert.ok(result.shops[i - 1].distanceKm <= result.shops[i].distanceKm);
    }
  });
});
