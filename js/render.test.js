import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shouldShowWalkingTime } from "./render.js";

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
