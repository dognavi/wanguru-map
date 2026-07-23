const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADII_KM = [2, 5, 10, 20, 50, 100];
const DEFAULT_MIN_COUNT = 1;
const DEFAULT_MAX_RESULTS = 20;
const WALKING_SPEED_M_PER_MIN = 80;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function sanitizeLocations(locations) {
  return locations.filter((location) => {
    const { lat, lng } = location;
    return (
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  });
}

export function dedupeByExactCoordinate(shops) {
  const groups = new Map();
  for (const shop of shops) {
    const key = `${shop.lat}:${shop.lng}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shop);
  }

  const representatives = [];
  const duplicatesByRepId = new Map();

  for (const group of groups.values()) {
    // 代表は id 最小に固定し、結果を決定的にする
    const sorted = [...group].sort((x, y) => x.id - y.id);
    const [representative, ...duplicates] = sorted;
    representatives.push(representative);
    if (duplicates.length > 0) {
      duplicatesByRepId.set(representative.id, duplicates);
    }
  }

  representatives.sort((a, b) => a.id - b.id);

  return { representatives, duplicatesByRepId };
}

export function findShopsWithAutoExpandingRadius(
  origin,
  shops,
  { radiiKm = DEFAULT_RADII_KM, minCount = DEFAULT_MIN_COUNT } = {},
) {
  const withDistance = shops
    .map((shop) => ({ shop, distanceKm: haversineDistanceKm(origin, shop) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.shop.id - b.shop.id);

  for (const radiusKm of radiiKm) {
    const within = withDistance.filter((entry) => entry.distanceKm <= radiusKm);
    if (within.length >= minCount) {
      return { shops: within, radiusUsedKm: radiusKm };
    }
  }

  const maxRadiusKm = radiiKm[radiiKm.length - 1];
  return {
    shops: withDistance.filter((entry) => entry.distanceKm <= maxRadiusKm),
    radiusUsedKm: maxRadiusKm,
  };
}

export function estimateWalkingMinutes(distanceKm) {
  return (distanceKm * 1000) / WALKING_SPEED_M_PER_MIN;
}

// 「近くの店」一覧を返す。数珠つなぎのコースは組まず、近い順に最大 maxResults 件を返すだけ。
// 半径内に1件でも見つかればそこで打ち切る(緩い保証: 無理に数を確保しにいかない)。
export function findNearbyShops(origin, allShops, options = {}) {
  const sanitized = sanitizeLocations(allShops);
  const { representatives, duplicatesByRepId } = dedupeByExactCoordinate(sanitized);

  const { shops: withinRadius, radiusUsedKm } = findShopsWithAutoExpandingRadius(
    origin,
    representatives,
    options.radius,
  );

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const shops = withinRadius.slice(0, maxResults).map((entry) => ({
    shop: entry.shop,
    distanceKm: entry.distanceKm,
    minutes: estimateWalkingMinutes(entry.distanceKm),
    nearbyDuplicates: duplicatesByRepId.get(entry.shop.id) || [],
  }));

  return { shops, radiusUsedKm, totalFound: withinRadius.length };
}
