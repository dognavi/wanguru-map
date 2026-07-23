const DEFAULT_RADIUS_KM = 2;
const FIT_BOUNDS_TARGET_COUNT = 5;
const WALKING_TIME_DISPLAY_MAX_KM = 10;

let shopLayerGroup = null;

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

// 徒歩時間はあくまで目安のため、実際に歩くには遠すぎる距離では時間を出さず
// 「徒歩圏外」とだけ示す。10kmという閾値は実データの分布(市街地は2km未満に
// 集中、郊外は数十kmに散らばる二山分布)から確認済み(Phase A/D方針で合意)。
export function shouldShowWalkingTime(distanceKm) {
  return distanceKm <= WALKING_TIME_DISPLAY_MAX_KM;
}

function createOriginIcon() {
  return L.divIcon({
    className: "origin-pin",
    html: '<span class="origin-pin-dot"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createNumberedIcon(number) {
  return L.divIcon({
    className: "shop-pin",
    html: `<span>${number}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function clearShopLayers(map) {
  if (shopLayerGroup) {
    map.removeLayer(shopLayerGroup);
    shopLayerGroup = null;
  }
}

export function renderShopsOnMap(map, result, origin) {
  // ページ読み込み直後などレイアウト確定前にmapが生成されると、Leafletが古いコンテナ
  // サイズをキャッシュしたままfitBoundsを計算し、ズームが異常に深くなることがある
  // (実測: 本来zoom14で収まるはずが誤ってzoom18になった)。描画のたびに最新サイズへ
  // 同期してから計算させる。
  map.invalidateSize();
  clearShopLayers(map);
  const layerGroup = L.layerGroup().addTo(map);
  shopLayerGroup = layerGroup;

  const originMarker = L.marker([origin.lat, origin.lng], { icon: createOriginIcon() });
  originMarker.bindPopup("出発地点");
  originMarker.addTo(layerGroup);

  // fitBoundsの対象は近い順の上位FIT_BOUNDS_TARGET_COUNT件だけに絞る。
  // 全20件を対象にすると密集地(渋谷など)で引きすぎてタップ不能率が45%に達したが、
  // 上位5件に絞ると自然にズームイン相当(14前後)になり10.5%まで改善した(実測済み)。
  // 該当件数が5件未満の場合は全件が対象になるため、羅臼町のような少数件・遠方の
  // ケースでも出発地点+その店を必ず収める従来通りの安全な挙動が保たれる。
  const latlngs = [[origin.lat, origin.lng]];
  const markersByShopId = new Map();
  result.shops.forEach((entry, index) => {
    const marker = L.marker([entry.shop.lat, entry.shop.lng], {
      icon: createNumberedIcon(index + 1),
    });
    marker.bindPopup(escapeHtml(entry.shop.name));
    marker.addTo(layerGroup);
    markersByShopId.set(entry.shop.id, marker);
    if (index < FIT_BOUNDS_TARGET_COUNT) {
      latlngs.push([entry.shop.lat, entry.shop.lng]);
    }
  });

  if (result.shops.length > 0) {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
  } else {
    map.setView([origin.lat, origin.lng], 14);
  }

  return markersByShopId;
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

function walkingTimeHtml(distanceKm, minutes) {
  return shouldShowWalkingTime(distanceKm)
    ? `${formatKm(distanceKm)}km・約${formatMinutes(minutes)}分(目安)`
    : `${formatKm(distanceKm)}km・徒歩圏外`;
}

function shopCardHtml(shop, distanceKm, minutes, number, duplicates) {
  return `
    <li class="shop-card" data-shop-id="${shop.id}">
      <div class="shop-card-number">${number}</div>
      <div class="shop-card-body">
        <h3>${escapeHtml(shop.name)}</h3>
        <p class="shop-card-meta">${escapeHtml(shop.genre || "")}</p>
        <p class="shop-card-meta">最寄り: ${escapeHtml(shop.access || "-")}</p>
        <p class="shop-card-meta">${walkingTimeHtml(distanceKm, minutes)}</p>
        <div class="shop-card-links">
          <a class="shop-card-link" href="${escapeHtml(shop.url)}" target="_blank" rel="noopener">詳しくは→わんグル</a>
          <a class="shop-card-link shop-card-link--secondary" href="${escapeHtml(googleMapsSearchUrl(shop.name, shop.address))}" target="_blank" rel="noopener">Googleマップで開く</a>
        </div>
        ${nearbyDuplicatesHtml(duplicates)}
      </div>
    </li>
  `;
}

function radiusNoticeHtml(radiusUsedKm) {
  if (radiusUsedKm <= DEFAULT_RADIUS_KM) return "";
  return `<p class="radius-notice">近くに見つからなかったため、探す範囲を${radiusUsedKm}kmまで広げました</p>`;
}

const DISCLAIMER_HTML = `
  <ul class="disclaimer">
    <li>距離と時間は直線距離をもとにした目安です。実際に歩く道のりはこれより長くなります。</li>
    <li>地図上のピンの位置は、実際の店舗とずれている場合があります。正確な場所は店舗ページかGoogleマップでご確認ください。</li>
  </ul>
`;

export function renderShopCards(container, result) {
  if (result.shops.length === 0) {
    container.innerHTML = `<p class="status-message">この周辺には、わんグル掲載の犬同伴OK店が見つかりませんでした。別の場所で試してみてください。</p>`;
    return;
  }

  const cards = result.shops
    .map((entry, index) =>
      shopCardHtml(entry.shop, entry.distanceKm, entry.minutes, index + 1, entry.nearbyDuplicates),
    )
    .join("");

  container.innerHTML = `
    ${radiusNoticeHtml(result.radiusUsedKm)}
    <ul class="shop-card-list">${cards}</ul>
    ${DISCLAIMER_HTML}
  `;
}
