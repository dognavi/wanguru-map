import { getCurrentPosition, describeGeolocationError } from "./geolocation.js";
import { searchPlace, NominatimTimeoutError } from "./nominatim.js";
import { generateWalkCourse } from "./route.js";
import { renderCourseOnMap, renderCourseCards } from "./render.js";

let map;
let currentOrigin = null;
let shops = [];

async function loadJson(path) {
  const response = await fetch(path);
  return response.json();
}

async function loadShopsAndAreas() {
  const [shopsData, areasData] = await Promise.all([
    loadJson("data/shops.json"),
    loadJson("data/areas.json"),
  ]);
  console.log(`shops: ${shopsData.shops.length}件`);
  console.log(`areas: ${areasData.areas.length}件`);
  return { shops: shopsData.shops, areas: areasData.areas };
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

  const result = generateWalkCourse(currentOrigin, shops);
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
  const loaded = await loadShopsAndAreas();
  shops = loaded.shops;
  setSearchUIEnabled(true);
  setStatus("");
}

main();
