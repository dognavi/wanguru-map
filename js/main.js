import { getCurrentPosition, describeGeolocationError } from "./geolocation.js";
import { searchPlace, NominatimTimeoutError } from "./nominatim.js";
import { findNearbyShops } from "./route.js";
import { renderShopsOnMap, renderShopCards } from "./render.js";

let map;
let currentOrigin = null;
let shops = [];
let currentMarkersByShopId = new Map();

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadShopsAndAreas() {
  const [shopsResult, areasResult] = await Promise.allSettled([
    loadJson("data/shops.json"),
    loadJson("data/areas.json"),
  ]);

  // 店舗データはアプリの根幹機能なので、失敗したら致命的エラーとして呼び出し元に伝える
  if (shopsResult.status === "rejected") {
    console.error("shops.jsonの読み込みに失敗しました", shopsResult.reason);
    return { shops: [], areas: [], shopsFailed: true };
  }
  const shops = shopsResult.value.shops;
  console.log(`shops: ${shops.length}件`);

  // areas.jsonはv1では未使用のため、失敗しても機能に影響しない
  let areas = [];
  if (areasResult.status === "fulfilled") {
    areas = areasResult.value.areas;
    console.log(`areas: ${areas.length}件`);
  } else {
    console.warn("areas.jsonの読み込みに失敗しました(v1では未使用のため影響なし)", areasResult.reason);
  }

  return { shops, areas, shopsFailed: false };
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

function highlightCard(shopId) {
  document.querySelectorAll(".shop-card").forEach((card) => {
    card.classList.toggle("shop-card--active", Number(card.dataset.shopId) === shopId);
  });
  const target = document.querySelector(`.shop-card[data-shop-id="${shopId}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// 一覧とピンの紐付けはshop.idで行う。カード・ピンとも検索のたびに作り直されるため、
// 一覧側のクリック監視だけは常設(#results)にし、対象のマーカーは
// currentMarkersByShopIdを都度差し替えて参照する。
function initResultsInteraction() {
  document.getElementById("results").addEventListener("click", (event) => {
    const card = event.target.closest(".shop-card");
    if (!card) return;
    const shopId = Number(card.dataset.shopId);
    const marker = currentMarkersByShopId.get(shopId);
    if (!marker) return;
    map.panTo(marker.getLatLng());
    marker.openPopup();
    highlightCard(shopId);
  });
}

function setOrigin(lat, lng, label) {
  currentOrigin = { lat, lng };
  setStatus(`出発地点: ${label}(${lat.toFixed(5)}, ${lng.toFixed(5)})`);

  const result = findNearbyShops(currentOrigin, shops);
  currentMarkersByShopId = renderShopsOnMap(map, result, currentOrigin);
  currentMarkersByShopId.forEach((marker, shopId) => {
    marker.on("click", () => highlightCard(shopId));
  });
  renderShopCards(document.getElementById("results"), result);
  document.querySelector("main").classList.add("has-results");
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
  initResultsInteraction();
  setSearchUIEnabled(false);
  setStatus("データを読み込み中...");
  const loaded = await loadShopsAndAreas();
  if (loaded.shopsFailed) {
    setStatus("店舗データの読み込みに失敗しました。ページを再読み込みしてください");
    return;
  }
  shops = loaded.shops;
  setSearchUIEnabled(true);
  setStatus("");
}

main();
