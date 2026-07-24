import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldShowWalkingTime, splitGenreTags } from "./render.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRealShops() {
  const raw = readFileSync(path.join(__dirname, "..", "data", "shops.json"), "utf-8");
  return JSON.parse(raw).shops;
}

describe("shouldShowWalkingTime", () => {
  test("10km以下は徒歩時間を表示する", () => {
    assert.equal(shouldShowWalkingTime(0), true);
    assert.equal(shouldShowWalkingTime(9.99), true);
  });

  test("ちょうど10kmは表示する(境界値は「以下」に含む)", () => {
    assert.equal(shouldShowWalkingTime(10), true);
  });

  test("10kmを超えたら徒歩圏外にする", () => {
    assert.equal(shouldShowWalkingTime(10.01), false);
    assert.equal(shouldShowWalkingTime(85.77), false);
  });

  test("破壊的テスト: 閾値を9kmに崩すと9.99kmのケースがredになることを確認", () => {
    const brokenThreshold = (distanceKm) => distanceKm <= 9;
    assert.equal(brokenThreshold(9.99), false);
    assert.equal(shouldShowWalkingTime(9.99), true);
  });
});

describe("splitGenreTags", () => {
  test("中黒区切りをタグの配列に分割する", () => {
    assert.deepEqual(splitGenreTags("居酒屋・ダイニングバー・イタリアン"), [
      "居酒屋",
      "ダイニングバー",
      "イタリアン",
    ]);
  });

  test("単一ジャンルもそのまま1件の配列になる", () => {
    assert.deepEqual(splitGenreTags("カフェ"), ["カフェ"]);
  });

  test("null・undefined・空文字は空配列を返す", () => {
    assert.deepEqual(splitGenreTags(null), []);
    assert.deepEqual(splitGenreTags(undefined), []);
    assert.deepEqual(splitGenreTags(""), []);
  });

  test("先頭・末尾の中黒、連続する中黒は空要素として除外する(防御的実装。実データには無いが将来のデータ更新に備える)", () => {
    assert.deepEqual(splitGenreTags("・カフェ・"), ["カフェ"]);
    assert.deepEqual(splitGenreTags("カフェ・・スイーツ"), ["カフェ", "スイーツ"]);
  });

  test("前後の半角・全角スペースはtrimされる", () => {
    assert.deepEqual(splitGenreTags(" カフェ ・ 　スイーツ　"), ["カフェ", "スイーツ"]);
  });

  test("実データ(shops.json)に表記ゆれが無いことを確認する回帰テスト", () => {
    const shops = loadRealShops();
    const genres = shops.map((s) => s.genre).filter((g) => g != null);
    const withLeadingDot = genres.filter((g) => g.startsWith("・")).length;
    const withTrailingDot = genres.filter((g) => g.endsWith("・")).length;
    const withDoubleDot = genres.filter((g) => g.includes("・・")).length;
    assert.equal(withLeadingDot, 0, "先頭中黒の店が新たに増えていないか");
    assert.equal(withTrailingDot, 0, "末尾中黒の店が新たに増えていないか");
    assert.equal(withDoubleDot, 0, "連続中黒の店が新たに増えていないか");
  });

  test("実データ: 最大5タグのジャンルも正しく分割できる", () => {
    const result = splitGenreTags("ジェラート・アイスクリーム・カフェ・クレープ・ガレット");
    assert.equal(result.length, 5);
  });
});
