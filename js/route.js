const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADII_KM = [2, 5, 10];
const DEFAULT_MIN_COUNT = 2;
const DEFAULT_MAX_STOPS = 4;
const DEFAULT_MAX_HOP_DISTANCE_KM = 5;
const WALKING_SPEED_M_PER_MIN = 80;
const DEFAULT_REQUIRED_TYPES = ["shop", "park"];

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// 店舗id(数値)・公園id(例: "way/18622557"の文字列)が混在するため、
// 両方とも数値のときだけ数値比較し、それ以外は文字列として比較する
function compareIds(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
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
    const sorted = [...group].sort((x, y) => compareIds(x.id, y.id));
    const [representative, ...duplicates] = sorted;
    representatives.push(representative);
    if (duplicates.length > 0) {
      duplicatesByRepId.set(representative.id, duplicates);
    }
  }

  representatives.sort((a, b) => compareIds(a.id, b.id));

  return { representatives, duplicatesByRepId };
}

export function findShopsWithAutoExpandingRadius(
  origin,
  shops,
  { radiiKm = DEFAULT_RADII_KM, minCount = DEFAULT_MIN_COUNT } = {},
) {
  const withDistance = shops
    .map((shop) => ({ shop, distanceKm: haversineDistanceKm(origin, shop) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || compareIds(a.shop.id, b.shop.id));

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

export function buildNearestNeighborCourse(
  origin,
  candidateShops,
  {
    maxStops = DEFAULT_MAX_STOPS,
    maxHopDistanceKm = DEFAULT_MAX_HOP_DISTANCE_KM,
    requiredTypes = [],
  } = {},
) {
  const remaining = [...candidateShops];
  const stops = [];
  let currentPoint = origin;
  let cumulativeDistanceKm = 0;
  const satisfiedTypes = new Set();

  while (stops.length < maxStops && remaining.length > 0) {
    // 最後の1枠になった時点で、まだ揃っていない種類が候補に残っていれば、
    // その枠だけ候補をその種類に絞る(緩い保証: 候補に無ければ無理はしない)
    const isFinalSlot = stops.length === maxStops - 1;
    const missingTypes = isFinalSlot
      ? requiredTypes.filter(
          (type) => !satisfiedTypes.has(type) && remaining.some((item) => item.type === type),
        )
      : [];
    const pool =
      missingTypes.length > 0 ? remaining.filter((item) => item.type === missingTypes[0]) : remaining;

    let nearestItem = null;
    let nearestDistanceKm = Infinity;

    for (const item of pool) {
      const distanceKm = haversineDistanceKm(currentPoint, item);
      const isCloser = distanceKm < nearestDistanceKm;
      const isTieButLowerId =
        distanceKm === nearestDistanceKm && nearestItem !== null && compareIds(item.id, nearestItem.id) < 0;

      if (isCloser || isTieButLowerId) {
        nearestDistanceKm = distanceKm;
        nearestItem = item;
      }
    }

    if (nearestItem === null || nearestDistanceKm > maxHopDistanceKm) break;

    cumulativeDistanceKm += nearestDistanceKm;
    stops.push({
      shop: nearestItem,
      distanceFromPrevKm: nearestDistanceKm,
      cumulativeDistanceKm,
    });

    remaining.splice(remaining.indexOf(nearestItem), 1);
    if (nearestItem.type) satisfiedTypes.add(nearestItem.type);
    currentPoint = { lat: nearestItem.lat, lng: nearestItem.lng };
  }

  return stops;
}

export function estimateWalkingMinutes(distanceKm) {
  return (distanceKm * 1000) / WALKING_SPEED_M_PER_MIN;
}

export function generateWalkCourse(origin, allShops, options = {}) {
  const sanitized = sanitizeLocations(allShops);
  const { representatives, duplicatesByRepId } = dedupeByExactCoordinate(sanitized);

  const { shops: withinRadius, radiusUsedKm } = findShopsWithAutoExpandingRadius(
    origin,
    representatives,
    options.radius,
  );
  const candidateShops = withinRadius.map((entry) => entry.shop);

  const courseOptions = { requiredTypes: DEFAULT_REQUIRED_TYPES, ...options.course };
  const stops = buildNearestNeighborCourse(origin, candidateShops, courseOptions).map((stop) => ({
    ...stop,
    nearbyDuplicates: duplicatesByRepId.get(stop.shop.id) || [],
  }));

  if (stops.length >= 2) {
    const last = stops[stops.length - 1];
    return {
      status: "course",
      stops,
      totalDistanceKm: last.cumulativeDistanceKm,
      totalMinutes: estimateWalkingMinutes(last.cumulativeDistanceKm),
      radiusUsedKm,
    };
  }

  if (stops.length === 1) {
    const [stop] = stops;
    return {
      status: "single",
      shop: stop.shop,
      distanceKm: stop.distanceFromPrevKm,
      minutes: estimateWalkingMinutes(stop.distanceFromPrevKm),
      nearbyDuplicates: stop.nearbyDuplicates,
      radiusUsedKm,
    };
  }

  return { status: "none", radiusUsedKm };
}
