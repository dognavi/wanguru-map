import { estimateWalkingMinutes } from "./route.js";

const DEFAULT_RADIUS_KM = 2;

let courseLayerGroup = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function formatKm(km) {
  return km.toFixed(2);
}

function formatMinutes(minutes) {
  return Math.round(minutes);
}

function createOriginIcon() {
  return L.divIcon({
    className: "origin-pin",
    html: '<span class="origin-pin-dot"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createNumberedIcon(number, type) {
  // 色だけでなく形でも区別する(店舗=丸/公園=角丸四角)。色覚多様性への配慮のため、
  // 色の違いだけに頼らない設計にしている
  const className = type === "park" ? "park-pin" : "shop-pin";
  return L.divIcon({
    className,
    html: `<span>${number}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function clearCourseLayers(map) {
  if (courseLayerGroup) {
    map.removeLayer(courseLayerGroup);
    courseLayerGroup = null;
  }
}

export function renderCourseOnMap(map, result, origin) {
  clearCourseLayers(map);
  const layerGroup = L.layerGroup().addTo(map);
  courseLayerGroup = layerGroup;

  const originMarker = L.marker([origin.lat, origin.lng], { icon: createOriginIcon() });
  originMarker.bindPopup("出発地点");
  originMarker.addTo(layerGroup);

  if (result.status === "course") {
    const latlngs = [[origin.lat, origin.lng]];
    result.stops.forEach((stop, index) => {
      const marker = L.marker([stop.shop.lat, stop.shop.lng], {
        icon: createNumberedIcon(index + 1, stop.shop.type),
      });
      marker.bindPopup(escapeHtml(stop.shop.name));
      marker.addTo(layerGroup);
      latlngs.push([stop.shop.lat, stop.shop.lng]);
    });

    // 「実際の道ではなく回る順番を示す線」であることはUI文言(disclaimer)で伝える。
    // 線自体は店同士のつながりがはっきり見えることを優先し、太さ・不透明度は変えない
    L.polyline(latlngs, {
      color: "#3d8f63",
      weight: 3,
      dashArray: "6 6",
    }).addTo(layerGroup);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
  } else if (result.status === "single") {
    const marker = L.marker([result.shop.lat, result.shop.lng], {
      icon: createNumberedIcon(1, result.shop.type),
    });
    marker.bindPopup(escapeHtml(result.shop.name));
    marker.addTo(layerGroup);
    map.fitBounds(
      L.latLngBounds([
        [origin.lat, origin.lng],
        [result.shop.lat, result.shop.lng],
      ]),
      { padding: [40, 40] },
    );
  } else {
    map.setView([origin.lat, origin.lng], 14);
  }
}

function nearbyDuplicatesHtml(duplicates) {
  if (!duplicates || duplicates.length === 0) return "";
  const items = duplicates
    .map(
      (dup) =>
        `<li><a href="${escapeHtml(dup.url)}" target="_blank" rel="noopener">${escapeHtml(dup.name)}</a></li>`,
    )
    .join("");
  return `<div class="shop-card-duplicates"><p>同じ場所にこんな店も</p><ul>${items}</ul></div>`;
}

function googleMapsSearchUrl(name, address) {
  const query = `${name} ${address ?? ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function shopCardHtml(shop, distanceKm, minutes, number, duplicates) {
  return `
    <li class="shop-card shop-card--shop">
      <div class="shop-card-number shop-card-number--shop">${number}</div>
      <div class="shop-card-body">
        <h3>${escapeHtml(shop.name)}</h3>
        <p class="shop-card-badge shop-card-badge--verified">わんグル確認済み</p>
        <p class="shop-card-meta">${escapeHtml(shop.genre || "")}</p>
        <p class="shop-card-meta">最寄り: ${escapeHtml(shop.access || "-")}</p>
        <p class="shop-card-meta">${formatKm(distanceKm)}km・約${formatMinutes(minutes)}分(目安)</p>
        <div class="shop-card-links">
          <a class="shop-card-link" href="${escapeHtml(shop.url)}" target="_blank" rel="noopener">詳しくは→わんグル</a>
          <a class="shop-card-link shop-card-link--secondary" href="${escapeHtml(googleMapsSearchUrl(shop.name, shop.address))}" target="_blank" rel="noopener">Googleマップで開く</a>
        </div>
        ${nearbyDuplicatesHtml(duplicates)}
      </div>
    </li>
  `;
}

function formatAreaHa(areaHa) {
  return typeof areaHa === "number" ? `約${areaHa.toFixed(1)}ha` : "面積不明";
}

function parkCardHtml(park, distanceKm, minutes, number) {
  const osmUrl = `https://www.openstreetmap.org/${park.id}`;
  return `
    <li class="shop-card shop-card--park">
      <div class="shop-card-number shop-card-number--park">${number}</div>
      <div class="shop-card-body">
        <h3>${escapeHtml(park.name)}</h3>
        <p class="shop-card-badge shop-card-badge--unverified">犬の同伴可否 未確認</p>
        <p class="shop-card-meta">面積: ${formatAreaHa(park.areaHa)}</p>
        <p class="shop-card-meta">${formatKm(distanceKm)}km・約${formatMinutes(minutes)}分(目安)</p>
        <p class="park-card-notice">犬の同伴可否は各公園にご確認ください</p>
        <a class="shop-card-link" href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener">OpenStreetMapで見る</a>
      </div>
    </li>
  `;
}

function locationCardHtml(location, distanceKm, minutes, number, duplicates) {
  return location.type === "park"
    ? parkCardHtml(location, distanceKm, minutes, number)
    : shopCardHtml(location, distanceKm, minutes, number, duplicates);
}

function radiusNoticeHtml(radiusUsedKm) {
  if (radiusUsedKm <= DEFAULT_RADIUS_KM) return "";
  return `<p class="radius-notice">近くに見つからなかったため、探す範囲を${radiusUsedKm}kmまで広げました</p>`;
}

const DISCLAIMER_HTML = `<p class="disclaimer">距離・時間は直線距離をもとにした目安です。実際の道のりはこれより長くなります。店同士は直線で結んでいるだけで、実際の道ではありません。店舗の位置は目安です。正確な場所は各店舗のページやGoogleマップでご確認ください。</p>`;

export function renderCourseCards(container, result) {
  if (result.status === "none") {
    container.innerHTML = `<p class="status-message">この周辺には、わんグル掲載の犬同伴OK店が見つかりませんでした。別の場所で試してみてください。</p>`;
    return;
  }

  if (result.status === "single") {
    container.innerHTML = `
      <p class="status-message">コースは作れませんが、近くにこのお店があります</p>
      ${radiusNoticeHtml(result.radiusUsedKm)}
      <ul class="shop-card-list">
        ${locationCardHtml(result.shop, result.distanceKm, result.minutes, 1, result.nearbyDuplicates)}
      </ul>
      ${DISCLAIMER_HTML}
    `;
    return;
  }

  const cards = result.stops
    .map((stop, index) =>
      locationCardHtml(
        stop.shop,
        stop.distanceFromPrevKm,
        estimateWalkingMinutes(stop.distanceFromPrevKm),
        index + 1,
        stop.nearbyDuplicates,
      ),
    )
    .join("");

  container.innerHTML = `
    ${radiusNoticeHtml(result.radiusUsedKm)}
    <ul class="shop-card-list">${cards}</ul>
    <p class="course-summary">コース合計: 約${formatKm(result.totalDistanceKm)}km・約${formatMinutes(result.totalMinutes)}分(目安)</p>
    ${DISCLAIMER_HTML}
  `;
}
