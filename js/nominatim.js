const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const DEFAULT_TIMEOUT_MS = 8000;

export class NominatimTimeoutError extends Error {
  constructor() {
    super("Nominatim request timed out");
    this.name = "NominatimTimeoutError";
  }
}

export async function searchPlace(query, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("accept-language", "ja");

  // fetchの中断エラーは環境によって error.name が TimeoutError/AbortError/TypeError と揺れるため、
  // 自前のフラグでタイムアウト発生を判定する(ブラウザ差異に依存しない)
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new NominatimTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status}`);
  }

  const results = await response.json();
  if (results.length === 0) return null;

  const [result] = results;
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
  };
}
