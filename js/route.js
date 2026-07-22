const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADII_KM = [2, 5, 10];
const DEFAULT_MIN_COUNT = 2;
const DEFAULT_MAX_STOPS = 4;
const DEFAULT_MAX_HOP_DISTANCE_KM = 5;
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

export function sanitizeShops(shops) {
  return shops.filter((shop) => {
    const { lat, lng } = shop;
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
    // 代表店は id 最小に固定し、結果を決定的にする
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

export function buildNearestNeighborCourse(
  origin,
  candidateShops,
  { maxStops = DEFAULT_MAX_STOPS, maxHopDistanceKm = DEFAULT_MAX_HOP_DISTANCE_KM } = {},
) {
  const remaining = [...candidateShops];
  const stops = [];
  let currentPoint = origin;
  let cumulativeDistanceKm = 0;

  while (stops.length < maxStops && remaining.length > 0) {
    let nearestIndex = -1;
    let nearestDistanceKm = Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const distanceKm = haversineDistanceKm(currentPoint, remaining[i]);
      const isCloser = distanceKm < nearestDistanceKm;
      const isTieButLowerId =
        distanceKm === nearestDistanceKm && remaining[i].id < remaining[nearestIndex].id;

      if (isCloser || isTieButLowerId) {
        nearestDistanceKm = distanceKm;
        nearestIndex = i;
      }
    }

    if (nearestDistanceKm > maxHopDistanceKm) break;

    const shop = remaining[nearestIndex];
    cumulativeDistanceKm += nearestDistanceKm;
    stops.push({
      shop,
      distanceFromPrevKm: nearestDistanceKm,
      cumulativeDistanceKm,
    });

    remaining.splice(nearestIndex, 1);
    currentPoint = { lat: shop.lat, lng: shop.lng };
  }

  return stops;
}

export function estimateWalkingMinutes(distanceKm) {
  return (distanceKm * 1000) / WALKING_SPEED_M_PER_MIN;
}

export function generateWalkCourse(origin, allShops, options = {}) {
  const sanitized = sanitizeShops(allShops);
  const { representatives, duplicatesByRepId } = dedupeByExactCoordinate(sanitized);

  const { shops: withinRadius, radiusUsedKm } = findShopsWithAutoExpandingRadius(
    origin,
    representatives,
    options.radius,
  );
  const candidateShops = withinRadius.map((entry) => entry.shop);

  const stops = buildNearestNeighborCourse(origin, candidateShops, options.course).map((stop) => ({
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
