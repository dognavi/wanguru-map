import { getCurrentPosition, describeGeolocationError } from "./geolocation.js";
import { searchPlace, NominatimTimeoutError } from "./nominatim.js";
import { generateWalkCourse } from "./route.js";
import { renderCourseOnMap, renderCourseCards } from "./render.js";

let map;
let currentOrigin = null;
let locations = [];

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadLocationsAndAreas() {
  const [shopsResult, areasResult, parksResult] = await Promise.allSettled([
    loadJson("data/shops.json"),
    loadJson("data/areas.json"),
    loadJson("data/parks.json"),
  ]);

  // 店舗データはアプリの根幹機能なので、失敗したら致命的エラーとして呼び出し元に伝える
  if (shopsResult.status === "rejected") {
    console.error("shops.jsonの読み込みに失敗しました", shopsResult.reason);
    return { locations: [], areas: [], shopsFailed: true };
  }
  const shops = shopsResult.value.shops.map((s) => ({ ...s, type: "shop" }));
  console.log(`shops: ${shops.length}件`);

  // areas.jsonはv1では未使用のため、失敗しても機能に影響しない
  let areas = [];
  if (areasResult.status === "fulfilled") {
    areas = areasResult.value.areas;
    console.log(`areas: ${areas.length}件`);
  } else {
    console.warn("areas.jsonの読み込みに失敗しました(v1では未使用のため影響なし)", areasResult.reason);
  }

  // 公園データは「あれば嬉しい追加機能」の緩い保証なので、失敗しても店舗だけで続行する
  let parks = [];
  if (parksResult.status === "fulfilled") {
    parks = parksResult.value.map((p) => ({ ...p, type: "park" }));
    console.log(`parks: ${parks.length}件`);
  } else {
    console.warn("parks.jsonの読み込みに失敗しました。店舗のみでコースを生成します", parksResult.reason);
  }

  return { locations: [...shops, ...parks], areas, shopsFailed: false };
}

function initMap() {
  const newMap = L.map("map").setView([36.5, 137.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(newMap);
  return newMap;
}

function setStatus(message) {
  document.getElementById("origin-status").textContent = message;
}

function setSearchUIEnabled(enabled) {
  document.getElementById("geolocate-btn").disabled = !enabled;
  document.getElementById("search-btn").disabled = !enabled;
  document.getElementById("place-input").disabled = !enabled;
}

function setOrigin(lat, lng, label) {
  currentOrigin = { lat, lng };
  setStatus(`出発地点: ${label}(${lat.toFixed(5)}, ${lng.toFixed(5)})`);

  const result = generateWalkCourse(currentOrigin, locations);
  document.querySelector("main").classList.add("has-results");
  renderCourseOnMap(map, result, currentOrigin);
  renderCourseCards(document.getElementById("results"), result);

  // has-resultsクラスの付与でmap要素のサイズがCSS上変わるため、
  // Leafletに再計測させないとタイル表示がずれる
  requestAnimationFrame(() => map.invalidateSize());
}

async function handleGeolocate() {
  const button = document.getElementById("geolocate-btn");
  if (button.disabled) return;

  button.disabled = true;
  setStatus("現在地を取得中...");
  try {
    const position = await getCurrentPosition();
    setOrigin(position.coords.latitude, position.coords.longitude, "現在地");
  } catch (error) {
    setStatus(describeGeolocationError(error));
  } finally {
    button.disabled = false;
  }
}

async function handleSearch() {
  const input = document.getElementById("place-input");
  const button = document.getElementById("search-btn");
  const query = input.value.trim();
  if (!query || button.disabled) return;

  input.disabled = true;
  button.disabled = true;
  setStatus("検索中...");
  try {
    const result = await searchPlace(query);
    if (!result) {
      setStatus("見つかりませんでした。地名・駅名で検索してください(番地までの住所は対応していません)");
      return;
    }
    setOrigin(result.lat, result.lng, result.displayName);
  } catch (error) {
    if (error instanceof NominatimTimeoutError) {
      setStatus("検索がタイムアウトしました。もう一度お試しください");
    } else {
      setStatus("検索中にエラーが発生しました");
    }
  } finally {
    input.disabled = false;
    button.disabled = false;
  }
}

function initSearchUI() {
  const geolocateBtn = document.getElementById("geolocate-btn");
  const searchBtn = document.getElementById("search-btn");
  const placeInput = document.getElementById("place-input");

  geolocateBtn.addEventListener("click", handleGeolocate);
  searchBtn.addEventListener("click", handleSearch);
  placeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      handleSearch();
    }
  });
}

function initResizeHandling() {
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => map.invalidateSize(), 150);
  });
}

async function main() {
  map = initMap();
  initSearchUI();
  initResizeHandling();
  setSearchUIEnabled(false);
  setStatus("データを読み込み中...");
  const loaded = await loadLocationsAndAreas();
  if (loaded.shopsFailed) {
    setStatus("店舗データの読み込みに失敗しました。ページを再読み込みしてください");
    return;
  }
  locations = loaded.locations;
  setSearchUIEnabled(true);
  setStatus("");
}

main();
