import { fetchSgcCatalog, isDesktopApp } from './desktop.js'

const USGS_DAILY_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
const SGC_FEED = 'https://api.sgc.gov.co/biweekly/biweekly_earthquakes'
const SGC_SEARCH_PATH = '/sgc-catalog'
const SOURCE_TIMEOUT_MS = 15000

export const BOGOTA = { lat: 4.711, lon: -74.0721, radiusKm: 250 }

export async function fetchEarthquakes(signal, onSourceStatus) {
  const [usgsResult, sgcResult] = await Promise.allSettled([
    fetchWithTimeout(fetchUsgs, signal),
    fetchWithTimeout(fetchSgc, signal),
  ])
  const sourceStatus = {
    USGS: getSourceStatus(usgsResult),
    SGC: getSourceStatus(sgcResult),
  }
  onSourceStatus?.(sourceStatus)
  const availableFeeds = [usgsResult, sgcResult].filter((result) => result.status === 'fulfilled')

  if (availableFeeds.length === 0) {
    throw new Error('No hay fuentes sísmicas disponibles')
  }

  return dedupeEvents(availableFeeds.flatMap((result) => result.value))
}

async function fetchWithTimeout(fetcher, parentSignal) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, SOURCE_TIMEOUT_MS)
  const abortFromParent = () => controller.abort()

  if (parentSignal?.aborted) controller.abort()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    return await fetcher(controller.signal)
  } catch (error) {
    if (timedOut) throw new Error(`La fuente tardó más de ${SOURCE_TIMEOUT_MS / 1000} segundos en responder`)
    throw error
  } finally {
    clearTimeout(timeoutId)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

function getSourceStatus(result) {
  if (result.status === 'fulfilled') {
    return { status: 'ok', count: result.value.length, error: null }
  }
  return { status: 'error', count: 0, error: result.reason?.message || 'Fuente no disponible' }
}

export function countNearby(events, center = BOGOTA) {
  const last24Hours = Date.now() - 24 * 60 * 60 * 1000
  return events.filter((event) => event.timestamp >= last24Hours && distanceBetween(center, event) <= center.radiusKm).length
}

export function distanceBetween(center, event) {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon) || !Number.isFinite(event?.latitude) || !Number.isFinite(event?.longitude)) return null
  return haversineKm(center.lat, center.lon, event.latitude, event.longitude)
}

function normalizeEvent(feature) {
  const [longitude, latitude, depth] = feature.geometry?.coordinates ?? [null, null, null]
  const properties = feature.properties ?? {}
  const magnitude = Number.isFinite(properties.mag) ? properties.mag : 0
  const timestamp = Number.isFinite(properties.time) ? properties.time : Date.now()
  const distanceKm = latitude === null || longitude === null ? null : haversineKm(BOGOTA.lat, BOGOTA.lon, latitude, longitude)

  return {
    id: feature.id,
    url: properties.url,
    place: properties.place || 'Ubicación no disponible',
    magnitude,
    magnitudeLabel: magnitude.toFixed(1),
    magnitudeType: (properties.magType || 'M').toUpperCase(),
    depth: `${Math.round(Math.abs(depth ?? 0))} km`,
    timestamp,
    time: formatTime(timestamp),
    timeLabel: formatTimeLabel(timestamp),
    source: 'USGS',
    tone: magnitude >= 4.5 ? 'amber' : 'blue',
    latitude,
    longitude,
    distanceKm,
    metadata: {
      eventId: feature.id,
      title: properties.title || properties.place || 'Evento sísmico',
      status: properties.status || properties.type || '—',
      agency: properties.net || 'USGS',
      localTime: formatDateTime(timestamp),
      utcTime: formatDateTime(timestamp, 'UTC'),
      updated: properties.updated ? formatDateTime(properties.updated) : null,
      felt: properties.felt ?? null,
      cdi: properties.cdi ?? null,
      mmi: properties.mmi ?? null,
      alert: properties.alert ?? null,
      nst: properties.nst ?? null,
      rms: properties.rms ?? null,
      gap: properties.gap ?? null,
      tsunami: properties.tsunami ?? null,
      closestTowns: null,
      dmin: properties.dmin ?? null,
      significance: properties.sig ?? null,
      networkCode: properties.net ?? null,
      eventCode: properties.code ?? null,
      associatedEvents: properties.ids ?? null,
      eventTypes: properties.types ?? null,
    },
  }
}

async function fetchUsgs(signal) {
  const response = await fetch(`${USGS_DAILY_FEED}?_=${Date.now()}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`USGS respondió con ${response.status}`)
  const payload = await response.json()
  return payload.features
    .map((feature) => normalizeEvent(feature))
    .filter((event) => event.latitude !== null && event.longitude !== null)
}

async function fetchSgc(signal) {
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + 1)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  if (isDesktopApp()) {
    const catalogEvents = await fetchSgcCatalog(toDateParam(startDate), toDateParam(endDate), signal)
    return catalogEvents
      .map((feature) => feature.geometry ? normalizeSgcEvent(feature) : normalizeSgcCatalogEvent(feature))
      .filter((event) => event.latitude !== null && event.longitude !== null)
  }

  if (import.meta.env?.DEV) {
    return fetchSgcCatalogWeb(startDate, endDate, signal)
  }

  return fetchSgcBiweekly(startDate, endDate, signal)
}

async function fetchSgcCatalogWeb(startDate, endDate, signal) {
  const query = {
    local_time_after: `${toDateParam(startDate)}T00:00:00.000Z`,
    local_time_before: `${toDateParam(endDate)}T23:59:59.999Z`,
  }
  const firstPage = await fetchSgcPage(query, 1, signal)
  const pageCount = Math.ceil(Number(firstPage.count || 0) / 100)
  const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => fetchSgcPage(query, index + 2, signal)))
  return [firstPage, ...remainingPages]
    .flatMap((page) => page.rows)
    .map(normalizeSgcCatalogEvent)
    .filter((event) => event.latitude !== null && event.longitude !== null)
}

async function fetchSgcBiweekly(startDate, endDate, signal) {
  const params = new URLSearchParams({ startdate: toDateParam(startDate), enddate: toDateParam(endDate), _: String(Date.now()) })
  const response = await fetch(`${SGC_FEED}?${params}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`SGC respondió con ${response.status}`)
  const payload = await response.json()
  return payload.features
    .map(normalizeSgcEvent)
    .filter((event) => event.latitude !== null && event.longitude !== null)
}

async function fetchSgcPage(query, page, signal) {
  const response = await fetch(`${SGC_SEARCH_PATH}?page=${page}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`SGC respondió con ${response.status}`)
  const payload = await response.json()
  return { count: payload.count, rows: payload.results?.results || [] }
}

function normalizeSgcEvent(feature) {
  const [longitude, latitude, depth] = feature.geometry?.coordinates ?? [null, null, null]
  const properties = feature.properties ?? {}
  const magnitude = Number.isFinite(properties.mag) ? properties.mag : 0
  const timestamp = parseSgcTime(properties.utcTime || properties.updated)
  const distanceKm = latitude === null || longitude === null ? null : haversineKm(BOGOTA.lat, BOGOTA.lon, latitude, longitude)

  return {
    id: feature.id,
    url: `https://www.sgc.gov.co/detallesismo/${feature.id}/resumen`,
    place: properties.place || 'Ubicación no disponible',
    magnitude,
    magnitudeLabel: magnitude.toFixed(1),
    magnitudeType: compactMagnitudeType(properties.magType),
    depth: `${Math.round(Math.abs(properties.depth ?? depth ?? 0))} km`,
    timestamp,
    time: formatTime(timestamp),
    timeLabel: formatTimeLabel(timestamp),
    source: 'SGC',
    tone: magnitude >= 4.5 ? 'amber' : 'blue',
    latitude,
    longitude,
    distanceKm,
    metadata: {
      eventId: feature.id,
      title: properties.place || 'Evento sísmico',
      status: properties.status || properties.type || '—',
      agency: properties.agency || 'SGC',
      utcTime: formatDateTime(timestamp, 'UTC'),
      localTime: formatDateTime(timestamp),
      updated: properties.updated ? formatDateTime(parseSgcTime(properties.updated)) : null,
      felt: properties.felt ?? null,
      cdi: properties.cdi ?? null,
      mmi: properties.mmi ?? null,
      alert: null,
      nst: properties.nst ?? null,
      rms: properties.rms ?? null,
      gap: properties.gap ?? null,
      tsunami: null,
      closestTowns: properties.closerTowns || null,
      dmin: properties.dmin ?? null,
      significance: properties.sig ?? null,
      networkCode: properties.net || properties.agency || null,
      eventCode: properties.code ?? null,
      associatedEvents: properties.ids ?? null,
      eventTypes: properties.types ?? null,
    },
  }
}

function normalizeSgcCatalogEvent(properties) {
  const latitude = Number.isFinite(Number(properties.latitude)) ? Number(properties.latitude) : null
  const longitude = Number.isFinite(Number(properties.longitude)) ? Number(properties.longitude) : null
  const magnitude = Number.isFinite(Number(properties.magnitude)) ? Number(properties.magnitude) : 0
  const timestamp = parseSgcTime(properties.utc_time || properties.updated)
  const depth = Number.isFinite(Number(properties.depth)) ? Number(properties.depth) : 0
  const distanceKm = latitude === null || longitude === null ? null : haversineKm(BOGOTA.lat, BOGOTA.lon, latitude, longitude)

  return {
    id: properties.id,
    url: `https://www.sgc.gov.co/detallesismo/${properties.id}/resumen`,
    place: properties.place || 'Ubicación no disponible',
    magnitude,
    magnitudeLabel: magnitude.toFixed(1),
    magnitudeType: compactMagnitudeType(properties.mag_type),
    depth: `${Math.round(Math.abs(depth))} km`,
    timestamp,
    time: formatTime(timestamp),
    timeLabel: formatTimeLabel(timestamp),
    source: 'SGC',
    tone: magnitude >= 4.5 ? 'amber' : 'blue',
    latitude,
    longitude,
    distanceKm,
    metadata: {
      eventId: properties.id,
      title: properties.place || 'Evento sísmico',
      status: properties.status || properties.event_type || '—',
      agency: properties.agency || 'SGC',
      utcTime: formatDateTime(timestamp, 'UTC'),
      localTime: properties.local_time || formatDateTime(timestamp),
      updated: null,
      felt: properties.felt_report_records ?? null,
      cdi: properties.cdi ?? null,
      mmi: properties.mmi ?? null,
      alert: null,
      nst: properties.nst ?? null,
      rms: properties.rms ?? null,
      gap: properties.gap ?? null,
      tsunami: null,
      closestTowns: properties.closer_towns || null,
      dmin: null,
      significance: null,
      networkCode: properties.agency || 'SGC',
      eventCode: properties.id,
      associatedEvents: null,
      eventTypes: properties.event_type || null,
    },
  }
}

function dedupeEvents(events) {
  const uniqueEvents = []
  const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp)

  for (const event of sortedEvents) {
    const duplicateIndex = uniqueEvents.findIndex((existing) => (
      existing.source !== event.source
      && Math.abs(existing.timestamp - event.timestamp) <= 2 * 60 * 1000
      && existing.latitude !== null
      && event.latitude !== null
      && haversineKm(existing.latitude, existing.longitude, event.latitude, event.longitude) <= 35
      && Math.abs(existing.magnitude - event.magnitude) <= 0.4
    ))

    if (duplicateIndex === -1) {
      uniqueEvents.push(event)
    } else if (event.source === 'SGC') {
      uniqueEvents[duplicateIndex] = event
    }
  }

  return uniqueEvents.sort((a, b) => b.timestamp - a.timestamp)
}

function toDateParam(date) {
  return date.toISOString().slice(0, 10)
}

function parseSgcTime(value) {
  if (!value) return Date.now()
  const normalized = typeof value === 'string' ? value.replace(' ', 'T').replace(/(?<!Z)$/, 'Z') : value
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function formatDateTime(value, timeZone) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(timestamp)
}

function compactMagnitudeType(value) {
  return (value || 'M').split('_')[0].toUpperCase()
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(timestamp)
}

function formatTimeLabel(timestamp) {
  const eventDate = new Date(timestamp)
  const now = new Date()
  const sameDay = eventDate.getFullYear() === now.getFullYear()
    && eventDate.getMonth() === now.getMonth()
    && eventDate.getDate() === now.getDate()
  const dayLabel = sameDay ? 'Hoy' : new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(eventDate)
  return `${dayLabel} · ${formatTime(timestamp)}`
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371
  const toRadians = (value) => value * Math.PI / 180
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
