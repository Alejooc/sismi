const EMSC_REALTIME_URL = 'wss://www.seismicportal.eu/standing_order/websocket'

export function subscribeEmscRealtime({ onStatus, onEvent } = {}) {
  let socket = null
  let reconnectTimer = null
  let reconnectAttempt = 0
  let stopped = false

  const setStatus = (status, error = null) => onStatus?.({ status, error })

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const delay = Math.min(30000, 3000 * (2 ** reconnectAttempt))
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect() {
    if (stopped) return
    setStatus('connecting')

    try {
      socket = new WebSocket(EMSC_REALTIME_URL)
    } catch (error) {
      setStatus('error', error?.message || 'No se pudo conectar con EMSC')
      scheduleReconnect()
      return
    }

    socket.addEventListener('open', () => {
      reconnectAttempt = 0
      setStatus('connected')
    })

    socket.addEventListener('message', (message) => {
      try {
        const payload = JSON.parse(message.data)
        const action = String(payload?.action || '').toLowerCase()
        if (action === 'delete') return
        const properties = payload?.data?.properties
        const event = normalizeEmscEvent(properties)
        if (event) onEvent?.(event)
      } catch {
        // Los mensajes de control de EMSC no deben interrumpir la conexión.
      }
    })

    socket.addEventListener('error', () => {
      setStatus('error', 'EMSC no respondió')
    })

    socket.addEventListener('close', () => {
      socket = null
      if (!stopped) {
        setStatus('error', 'Conexión EMSC cerrada')
        scheduleReconnect()
      }
    })
  }

  connect()

  return () => {
    stopped = true
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = null
    socket?.close()
    socket = null
  }
}

function normalizeEmscEvent(properties) {
  if (!properties) return null

  const latitude = toNumber(properties.lat)
  const longitude = toNumber(properties.lon)
  const magnitude = toNumber(properties.mag)
  const timestamp = Date.parse(properties.time)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(magnitude) || !Number.isFinite(timestamp)) return null

  const id = String(properties.unid || `${properties.source_catalog || 'EMSC'}-${properties.source_id || `${timestamp}-${latitude}-${longitude}`}`)
  const depth = toNumber(properties.depth)
  const place = properties.flynn_region || properties.region || 'Ubicación no disponible'

  return {
    id,
    url: `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${encodeURIComponent(properties.source_id || '')}`,
    place,
    magnitude,
    magnitudeLabel: magnitude.toFixed(1),
    magnitudeType: String(properties.magtype || 'M').toUpperCase(),
    depth: `${Math.round(Math.abs(depth || 0))} km`,
    timestamp,
    time: formatTime(timestamp),
    timeLabel: formatTimeLabel(timestamp),
    source: 'EMSC',
    tone: magnitude >= 4.5 ? 'amber' : 'blue',
    latitude,
    longitude,
    distanceKm: null,
    metadata: {
      eventId: id,
      title: place,
      status: 'Detección rápida',
      agency: properties.auth || 'EMSC',
      localTime: formatDateTime(timestamp),
      utcTime: formatDateTime(timestamp, 'UTC'),
      updated: properties.lastupdate ? formatDateTime(Date.parse(properties.lastupdate), 'UTC') : null,
      felt: null,
      cdi: null,
      mmi: null,
      alert: null,
      nst: null,
      rms: null,
      gap: null,
      tsunami: null,
      closestTowns: null,
      dmin: null,
      significance: null,
      networkCode: properties.source_catalog || 'EMSC-RTS',
      eventCode: properties.source_id || id,
      associatedEvents: null,
      eventTypes: properties.evtype || null,
    },
  }
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatDateTime(value, timeZone) {
  if (!Number.isFinite(value)) return null
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(value)
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp)
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
