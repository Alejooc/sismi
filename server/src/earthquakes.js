const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const SGC_PUBLIC_FEED_URL = "https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json";
const REQUEST_TIMEOUT_MS = 15_000;
const SGC_REQUEST_HEADERS = {
  Accept: "application/geo+json, application/json, text/plain, */*",
  Referer: "https://www.sgc.gov.co/sismos",
  "User-Agent": "Mozilla/5.0 (compatible; SismiMonitor/1.0; +https://alertassismi.jaofy.com) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
};

let sgcFeedCache = { url: null, etag: null, lastModified: null, events: null };

export async function fetchUsgsEvents(fetchImpl = fetch) {
  const response = await fetchImpl(USGS_URL, {
    headers: { Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`USGS respondió con HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.features ?? []).map((feature) => normalizeGeoJson(feature, "USGS")).filter(Boolean);
}

export async function fetchSgcEvents({
  fetchImpl = fetch,
  windowDays = 2,
  now = new Date(),
  feedUrl = SGC_PUBLIC_FEED_URL,
  relayToken = "",
} = {}) {
  const useSharedCache = fetchImpl === fetch;
  const headers = { ...SGC_REQUEST_HEADERS };
  if (relayToken) headers.Authorization = `Bearer ${relayToken}`;
  if (useSharedCache && sgcFeedCache.url === feedUrl && sgcFeedCache.etag) headers["If-None-Match"] = sgcFeedCache.etag;
  if (useSharedCache && sgcFeedCache.url === feedUrl && sgcFeedCache.lastModified) headers["If-Modified-Since"] = sgcFeedCache.lastModified;

  const response = await fetchImpl(feedUrl, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let events;
  if (response.status === 304 && useSharedCache && sgcFeedCache.events) {
    events = sgcFeedCache.events;
  } else {
    if (!response.ok) throw new Error(`Feed público SGC respondió con HTTP ${response.status}`);
    const payload = await response.json();
    events = (payload.features ?? []).map(normalizeSgcPublicGeoJson).filter(Boolean);
    if (useSharedCache) {
      sgcFeedCache = {
        url: feedUrl,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        events,
      };
    }
  }

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return events.filter((event) => event.timestamp >= cutoff);
}

export function normalizeEmscMessage(message) {
  if (String(message?.action ?? "").toLowerCase() === "delete") return null;
  const properties = message?.data?.properties;
  if (!properties) return null;
  const latitude = finiteNumber(properties.lat);
  const longitude = finiteNumber(properties.lon);
  const magnitude = finiteNumber(properties.mag);
  const timestamp = parseTimestamp(properties.time);
  if (latitude == null || longitude == null || magnitude == null || timestamp == null) return null;
  const id = String(properties.unid || properties.source_id || `EMSC-${timestamp}-${latitude}-${longitude}`);
  return {
    id,
    source: "EMSC",
    place: String(properties.flynn_region || properties.region || "Ubicación no disponible"),
    magnitude,
    magnitudeType: String(properties.magtype || "M").toUpperCase(),
    depthKm: finiteNumber(properties.depth),
    timestamp,
    latitude,
    longitude,
    agency: String(properties.auth || "EMSC"),
    eventUrl: properties.source_id ? `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${encodeURIComponent(properties.source_id)}` : null,
  };
}

function normalizeGeoJson(feature, source) {
  const coords = feature?.geometry?.coordinates;
  const props = feature?.properties;
  if (!Array.isArray(coords) || !props) return null;
  const longitude = finiteNumber(coords[0]);
  const latitude = finiteNumber(coords[1]);
  const magnitude = finiteNumber(props.mag);
  const timestamp = parseTimestamp(props.time);
  if (latitude == null || longitude == null || magnitude == null || timestamp == null) return null;
  return {
    id: String(feature.id || props.code || `${source}-${timestamp}-${latitude}-${longitude}`),
    source,
    place: String(props.place || "Ubicación no disponible"),
    magnitude,
    magnitudeType: String(props.magType || "M").toUpperCase(),
    depthKm: finiteNumber(coords[2]),
    timestamp,
    latitude,
    longitude,
    agency: String(props.net || source),
    eventUrl: typeof props.url === "string" ? props.url : null,
  };
}

function normalizeSgcPublicGeoJson(feature) {
  const coords = feature?.geometry?.coordinates;
  const props = feature?.properties;
  if (!Array.isArray(coords) || !props) return null;
  // El feed del visor oficial publica [latitud, longitud, profundidad].
  const latitude = finiteNumber(coords[0]);
  const longitude = finiteNumber(coords[1]);
  const magnitude = finiteNumber(props.mag);
  const timestamp = parseSgcTimestamp(props.utcTime || props.updated);
  if (latitude == null || longitude == null || magnitude == null || timestamp == null) return null;
  const id = String(feature.id || props.id || `SGC-${timestamp}-${latitude}-${longitude}`);
  return {
    id,
    source: "SGC",
    place: String(props.place || "Ubicación no disponible"),
    magnitude,
    magnitudeType: String(props.magType || "ML").split("_")[0].toUpperCase(),
    depthKm: finiteNumber(coords[2]),
    timestamp,
    latitude,
    longitude,
    agency: String(props.agency || "SGC"),
    eventUrl: `https://www.sgc.gov.co/detallesismo/${encodeURIComponent(id)}/resumen`,
  };
}

function finiteNumber(value) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseSgcTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") return parseTimestamp(value);
  const text = value.trim().replace(" ", "T");
  const utcText = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  return parseTimestamp(utcText);
}
