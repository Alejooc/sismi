const USGS_DAILY_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
const SGC_FEED = 'https://api.sgc.gov.co/biweekly/biweekly_earthquakes'

export const BOGOTA = { lat: 4.711, lon: -74.0721, radiusKm: 250 }

export async function fetchEarthquakes(signal) {
  const [usgsResult, sgcResult] = await Promise.allSettled([
    fetchUsgs(signal),
    fetchSgc(signal),
  ])
  const availableFeeds = [usgsResult, sgcResult].filter((result) => result.status === 'fulfilled')

  if (availableFeeds.length === 0) {
    throw new Error('No hay fuentes sísmicas disponibles')
  }

  return dedupeEvents(availableFeeds.flatMap((result) => result.value))
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
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 7)
  const params = new URLSearchParams({ startdate: toDateParam(startDate), enddate: toDateParam(endDate), _: String(Date.now()) })
  const response = await fetch(`${SGC_FEED}?${params}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`SGC respondió con ${response.status}`)
  const payload = await response.json()
  return payload.features
    .map(normalizeSgcEvent)
    .filter((event) => event.latitude !== null && event.longitude !== null)
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
