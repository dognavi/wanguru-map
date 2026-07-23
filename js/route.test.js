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
  buildNearestNeighborCourse,
  estimateWalkingMinutes,
  generateWalkCourse,
} from "./route.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRealShops() {
  const raw = readFileSync(path.join(__dirname, "..", "data", "shops.json"), "utf-8");
  return JSON.parse(raw).shops;
}

function loadRealParks() {
  const raw = readFileSync(path.join(__dirname, "..", "data", "parks.json"), "utf-8");
  return JSON.parse(raw);
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

  test("実データ(data/parks.json)は全件が有効な座標を持つ(欠損0件を確認済み)", () => {
    const parks = loadRealParks();
    const result = sanitizeLocations(parks);
    assert.equal(result.length, parks.length);
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

  test("実データで重複除外後の件数が2085件→2048件になる(37組=74店の重複を確認済み)", () => {
    const shops = loadRealShops();
    assert.equal(shops.length, 2085);
    const { representatives } = dedupeByExactCoordinate(shops);
    assert.equal(representatives.length, 2048);
  });

  test("実データ(parks.json)で重複除外後の件数が5607件→5576件になる(31組=62件の重複を確認済み)", () => {
    const parks = loadRealParks();
    assert.equal(parks.length, 5607);
    const { representatives } = dedupeByExactCoordinate(parks);
    assert.equal(representatives.length, 5576);
  });

  test("店舗(数値id)と公園(文字列id)が混在していても、タイブレークが決定的に働く", () => {
    const mixed = [
      { id: "way/999", lat: 35.0, lng: 139.0 },
      { id: 5, lat: 35.0, lng: 139.0 },
    ];
    const { representatives, duplicatesByRepId } = dedupeByExactCoordinate(mixed);
    // compareIds は数値・文字列混在時に文字列として比較する("5" < "way/999")
    assert.deepEqual(representatives.map((r) => r.id), [5]);
    assert.deepEqual(duplicatesByRepId.get(5).map((r) => r.id), ["way/999"]);
  });

  test("店舗2085件+公園5607件を統合しても、それぞれの重複除外が正しく効く(店舗と公園で座標が重なる例は実データに無いことを確認済み)", () => {
    const shops = loadRealShops();
    const parks = loadRealParks();
    const { representatives } = dedupeByExactCoordinate([...shops, ...parks]);
    // 2048(店舗) + 5576(公園) = 7624。店舗と公園をまたぐ重複が実データに存在しないため、
    // 単純な合算と一致するはず
    assert.equal(representatives.length, 2048 + 5576);
  });
});

describe("findShopsWithAutoExpandingRadius", () => {
  test("2km圏内に1件しかなければ5km圏まで自動拡張する", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 }, // 約0.11km
      { id: 2, lat: 35.03, lng: 139.0 }, // 約3.34km(2km圏外・5km圏内)
    ];
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.equal(radiusUsedKm, 5);
    assert.equal(found.length, 2);
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

  test("10kmまで拡張しても2件未満なら、見つかった分だけ返す", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 35.001, lng: 139.0 }];
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.equal(radiusUsedKm, 10);
    assert.equal(found.length, 1);
  });

  test("店舗(数値id)と公園(文字列id)が同距離でも、タイブレークがエラーにならず決定的に働く", () => {
    const origin = { lat: 0, lng: 0 };
    const mixed = [
      { id: "way/1", lat: 0.01, lng: 0 },
      { id: 5, lat: 0.01, lng: 0 }, // 同一距離
    ];
    const { shops: found } = findShopsWithAutoExpandingRadius(origin, mixed);
    assert.deepEqual(
      found.map((entry) => entry.shop.id),
      [5, "way/1"],
    );
  });

  test("10km圏内にも1件も無ければ0件で返す", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 36.0, lng: 140.0 }]; // 遠く離れた店
    const { shops: found, radiusUsedKm } = findShopsWithAutoExpandingRadius(origin, shops);
    assert.equal(radiusUsedKm, 10);
    assert.equal(found.length, 0);
  });
});

describe("buildNearestNeighborCourse", () => {
  test("起点は検索地点(origin)そのもの。originに最も近い店から選ばれる", () => {
    // origin から見て shopNear の方が shopFar よりずっと近い
    const origin = { lat: 10, lng: 10 };
    const shopNear = { id: 1, lat: 10.001, lng: 10 }; // originから約0.11km
    const shopFar = { id: 2, lat: 20, lng: 20 }; // originから遠く離れている
    const stops = buildNearestNeighborCourse(origin, [shopFar, shopNear]);
    assert.equal(stops[0].shop.id, 1);
  });

  test("距離が同点の候補は常にid昇順で選ばれる(タイブレークの決定性)", () => {
    const origin = { lat: 0, lng: 0 };
    const shopA = { id: 7, lat: 0.01, lng: 0 };
    const shopB = { id: 3, lat: 0.01, lng: 0 }; // shopAと同一距離、idはこちらが小さい
    const stops = buildNearestNeighborCourse(origin, [shopA, shopB]);
    assert.equal(stops[0].shop.id, 3);
  });

  test("店舗(数値id)と公園(文字列id)が同距離でタイになっても、エラーにならず決定的に選ばれる", () => {
    const origin = { lat: 0, lng: 0 };
    const park = { id: "way/1", lat: 0.01, lng: 0 };
    const shop = { id: 5, lat: 0.01, lng: 0 }; // 同一距離
    const stops = buildNearestNeighborCourse(origin, [park, shop]);
    assert.equal(stops[0].shop.id, 5);
  });

  test("候補が5件以上あっても最大4件で打ち切られる", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [1, 2, 3, 4, 5].map((n) => ({
      id: n,
      lat: 0.001 * n,
      lng: 0,
    }));
    const stops = buildNearestNeighborCourse(origin, shops);
    assert.equal(stops.length, 4);
  });

  test("ホップ距離閾値を明示指定した場合、それを超える候補には接続せず打ち切る", () => {
    const origin = { lat: 0, lng: 0 };
    // shopNear は origin から約7.99km、shopFar は origin から約8.99km(反対方向)
    // shopNear-shopFar 間は約17kmでmaxHopDistanceKm(10km)を超える
    const shopNear = { id: 1, lat: 0.072, lng: 0 };
    const shopFar = { id: 2, lat: -0.081, lng: 0 };
    const stops = buildNearestNeighborCourse(origin, [shopNear, shopFar], {
      maxHopDistanceKm: 10,
    });
    assert.equal(stops.length, 1);
    assert.equal(stops[0].shop.id, 1);
  });

  test("既定のホップ距離閾値(5km)を超える候補には接続せず打ち切る", () => {
    const origin = { lat: 0, lng: 0 };
    // shopNear は origin から約1.0km、shopFar は shopNear から約7.0km
    const shopNear = { id: 1, lat: 0.009, lng: 0 };
    const shopFar = { id: 2, lat: 0.072, lng: 0 };
    const stops = buildNearestNeighborCourse(origin, [shopNear, shopFar]);
    assert.equal(stops.length, 1);
    assert.equal(stops[0].shop.id, 1);
  });

  test("候補が0件なら空配列を返す", () => {
    const origin = { lat: 0, lng: 0 };
    assert.deepEqual(buildNearestNeighborCourse(origin, []), []);
  });

  describe("requiredTypes(最後の1枠だけ型を強制)", () => {
    test("店舗4件だけだと全部店舗で埋まる候補でも、公園が候補にあれば最後の1枠が公園に強制される", () => {
      const origin = { lat: 0, lng: 0 };
      const shops = [1, 2, 3, 4].map((n) => ({
        id: n,
        type: "shop",
        lat: 0.001 * n,
        lng: 0,
      }));
      const park = { id: "way/1", type: "park", lat: 0.005, lng: 0 }; // 4店より少し遠いが十分近い
      const stops = buildNearestNeighborCourse(origin, [...shops, park], {
        requiredTypes: ["shop", "park"],
      });
      assert.equal(stops.length, 4);
      assert.deepEqual(
        stops.map((s) => s.shop.id),
        [1, 2, 3, "way/1"],
      );
      assert.deepEqual(
        stops.map((s) => s.shop.type),
        ["shop", "shop", "shop", "park"],
      );
    });

    test("公園が候補に無ければ、無理に入れず通常どおり店舗だけで埋まる(緩い保証)", () => {
      const origin = { lat: 0, lng: 0 };
      const shops = [1, 2, 3, 4].map((n) => ({
        id: n,
        type: "shop",
        lat: 0.001 * n,
        lng: 0,
      }));
      const stops = buildNearestNeighborCourse(origin, shops, {
        requiredTypes: ["shop", "park"],
      });
      assert.equal(stops.length, 4);
      assert.deepEqual(
        stops.map((s) => s.shop.id),
        [1, 2, 3, 4],
      );
    });

    test("最後の1枠を型強制した際、候補までのホップ距離が閾値を超えていれば無理に入れず、コースが短くなる", () => {
      const origin = { lat: 0, lng: 0 };
      const shops = [1, 2, 3].map((n) => ({
        id: n,
        type: "shop",
        lat: 0.001 * n,
        lng: 0,
      }));
      // shop3(約0.33km)から公園までは約10.8km離れており、既定のホップ閾値(5km)を超える
      const farPark = { id: "way/1", type: "park", lat: 0.1, lng: 0 };
      const stops = buildNearestNeighborCourse(origin, [...shops, farPark], {
        requiredTypes: ["shop", "park"],
      });
      assert.equal(stops.length, 3);
      assert.deepEqual(
        stops.map((s) => s.shop.id),
        [1, 2, 3],
      );
    });

    test("同じ入力なら何度実行しても同じコースになる(決定性)", () => {
      const origin = { lat: 0, lng: 0 };
      const shops = [1, 2, 3, 4].map((n) => ({
        id: n,
        type: "shop",
        lat: 0.001 * n,
        lng: 0,
      }));
      const park = { id: "way/1", type: "park", lat: 0.005, lng: 0 };
      const options = { requiredTypes: ["shop", "park"] };
      const run1 = buildNearestNeighborCourse(origin, [...shops, park], options);
      const run2 = buildNearestNeighborCourse(origin, [...shops, park], options);
      const run3 = buildNearestNeighborCourse(origin, [park, ...shops].reverse(), options);
      assert.deepEqual(
        run1.map((s) => s.shop.id),
        run2.map((s) => s.shop.id),
      );
      assert.deepEqual(
        run1.map((s) => s.shop.id),
        run3.map((s) => s.shop.id),
      );
    });
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

describe("generateWalkCourse", () => {
  test("候補が0件ならstatus:'none'になる", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 40.0, lng: 145.0 }]; // 10km圏外
    const result = generateWalkCourse(origin, shops);
    assert.equal(result.status, "none");
  });

  test("候補が1件ならstatus:'single'になる", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [{ id: 1, lat: 35.001, lng: 139.0 }];
    const result = generateWalkCourse(origin, shops);
    assert.equal(result.status, "single");
    assert.equal(result.shop.id, 1);
  });

  test("候補が2件以上ならstatus:'course'になり2〜4店で構成される", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [1, 2, 3].map((n) => ({
      id: n,
      lat: 35.0 + 0.001 * n,
      lng: 139.0,
    }));
    const result = generateWalkCourse(origin, shops);
    assert.equal(result.status, "course");
    assert.ok(result.stops.length >= 2 && result.stops.length <= 4);
  });

  test("店舗のみでも公園のみでも候補があれば、generateWalkCourseは既定でrequiredTypes=['shop','park']を適用する", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [1, 2, 3, 4].map((n) => ({
      id: n,
      type: "shop",
      lat: 0.001 * n,
      lng: 0,
    }));
    const park = { id: "way/1", type: "park", lat: 0.005, lng: 0 };
    const result = generateWalkCourse(origin, [...shops, park]);
    assert.equal(result.status, "course");
    assert.deepEqual(
      result.stops.map((s) => s.shop.type),
      ["shop", "shop", "shop", "park"],
    );
  });

  test("公園データが無ければ、店舗だけで通常どおりコースが組まれる(緩い保証)", () => {
    const origin = { lat: 0, lng: 0 };
    const shops = [1, 2, 3].map((n) => ({
      id: n,
      type: "shop",
      lat: 0.001 * n,
      lng: 0,
    }));
    const result = generateWalkCourse(origin, shops);
    assert.equal(result.status, "course");
    assert.equal(result.stops.length, 3);
  });

  test("ホップ距離が離れすぎている場合はcourseではなくsingleに切り詰められる(既定値5km)", () => {
    const origin = { lat: 0, lng: 0 };
    // shopNear は origin から約1.0km(2〜10km圏の自動拡張の過程で見つかる)
    // shopFar は origin から約8.0km。shopNear-shopFar間は約7.0kmでmaxHopDistanceKm(5km)を超える
    const shopNear = { id: 1, lat: 0.009, lng: 0 };
    const shopFar = { id: 2, lat: 0.072, lng: 0 };
    const result = generateWalkCourse(origin, [shopNear, shopFar]);
    assert.equal(result.status, "single");
    assert.equal(result.shop.id, 1);
    assert.equal(result.radiusUsedKm, 10);
  });

  test("同座標グループの重複店は、コース採用店のnearbyDuplicatesにのみ現れる(#2)", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 },
      { id: 2, lat: 35.001, lng: 139.0 }, // id=1と同座標の重複店
      { id: 3, lat: 35.002, lng: 139.0 },
    ];
    const result = generateWalkCourse(origin, shops);
    assert.equal(result.status, "course");
    const first = result.stops.find((s) => s.shop.id === 1);
    assert.deepEqual(
      first.nearbyDuplicates.map((s) => s.id),
      [2],
    );
  });

  test("重複除外は半径絞り込みより前に行われる(#3の設計判断): 同座標2店だけの地点は実質1地点として扱われ、半径は自動拡張される", () => {
    const origin = { lat: 35.0, lng: 139.0 };
    // id:1とid:2は完全に同じ座標(重複ペア)。他には10km圏内に店が無い
    const shops = [
      { id: 1, lat: 35.001, lng: 139.0 },
      { id: 2, lat: 35.001, lng: 139.0 },
    ];
    const result = generateWalkCourse(origin, shops);
    // 重複除外前に絞り込むと「2店見つかった」と誤判定し radiusUsedKm が 2 のまま返ってしまう
    assert.equal(result.status, "single");
    assert.equal(result.radiusUsedKm, 10);
  });

  test("実データ(data/shops.json)から現実的な出力が得られる", () => {
    const shops = loadRealShops();
    const shibuyaStation = { lat: 35.658034, lng: 139.701636 };
    const result = generateWalkCourse(shibuyaStation, shops);
    assert.ok(["course", "single", "none"].includes(result.status));
  });
});
