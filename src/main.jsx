import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BOGOTA, countNearby, distanceBetween, fetchEarthquakes } from './services/earthquakes'
import { subscribeEmscRealtime } from './services/emsc'
import { searchLocations } from './services/locations'
import { closeWindow as closeDesktopWindow, getStartWithWindows, isDesktopApp, minimizeWindow as minimizeDesktopWindow, notifyDesktop, playAlertSound, requestNotificationPermission, setStartWithWindows as setStartWithWindowsNative } from './services/desktop'
import { APP_VERSION, checkForSismiUpdate } from './services/updater'
import './styles.css'

const DEFAULT_LOCATION = { label: 'Bogotá, Colombia', lat: BOGOTA.lat, lon: BOGOTA.lon, radiusKm: 250 }
const DATA_STALE_AFTER_MS = 5 * 60 * 1000
function getMapPoints(events) {
  const gridStep = events.length > 800 ? 1.5 : 1
  const buckets = new Map()

  events.forEach((event) => {
    const latitude = Number(event.latitude)
    const longitude = Number(event.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const latitudeBucket = Math.floor((latitude + 90) / gridStep)
    const longitudeBucket = Math.floor((longitude + 180) / gridStep)
    const key = `${latitudeBucket}:${longitudeBucket}`
    const bucket = buckets.get(key) || []
    bucket.push(event)
    buckets.set(key, bucket)
  })

  return [...buckets.entries()].map(([key, bucket]) => {
    const sorted = [...bucket].sort((first, second) => (
      Number(second.magnitude) - Number(first.magnitude) || second.timestamp - first.timestamp
    ))
    const representative = sorted[0]
    return {
      ...representative,
      id: bucket.length > 1 ? `cluster:${key}` : representative.id,
      isCluster: bucket.length > 1,
      clusterSize: bucket.length,
      clusterEvents: bucket,
    }
  })
}

function filterMapEvents(events, { source, minMagnitude, timeRange, query, onlyNearby, location }) {
  const normalizedQuery = query.trim().toLowerCase()
  const now = Date.now()
  const rangeMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 }[timeRange]

  return events.filter((event) => {
    if (source !== 'all' && event.source !== source) return false
    if (Number(event.magnitude) < minMagnitude) return false
    if (rangeMs && event.timestamp < now - rangeMs) return false
    if (onlyNearby && !isNearby(event, location)) return false
    if (normalizedQuery && ![event.place, event.source, event.metadata?.title, event.metadata?.agency].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)) return false
    return Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))
  })
}

function getEventKey(event) {
  const source = event?.source || 'feed'
  if (event?.id) return `${source}:${event.id}`
  const timestamp = Number.isFinite(event?.timestamp) ? Math.round(event.timestamp / 60000) : 'sin-hora'
  const latitude = Number.isFinite(event?.latitude) ? Number(event.latitude).toFixed(3) : 'sin-lat'
  const longitude = Number.isFinite(event?.longitude) ? Number(event.longitude).toFixed(3) : 'sin-lon'
  const magnitude = Number.isFinite(event?.magnitude) ? Number(event.magnitude).toFixed(1) : 'sin-magnitud'
  return `${source}:${timestamp}:${latitude}:${longitude}:${magnitude}`
}

const initialEvents = [
  { id: 'demo-1', place: 'Los Santos, Santander', magnitude: 4.6, magnitudeLabel: '4.6', magnitudeType: 'ML', depth: '148 km', time: '8:44 p. m.', timeLabel: 'Hoy · 8:44 p. m.', source: 'SGC', tone: 'amber', timestamp: Date.now() - 40 * 60 * 1000, latitude: 6.8, longitude: -73.1, metadata: { eventId: 'demo-1', status: 'revisado', agency: 'SGC' } },
  { id: 'demo-2', place: 'Cumbal, Nariño', magnitude: 3.1, magnitudeLabel: '3.1', magnitudeType: 'ML', depth: '7 km', time: '6:26 p. m.', timeLabel: 'Hoy · 6:26 p. m.', source: 'SGC', tone: 'green', timestamp: Date.now() - 3 * 60 * 60 * 1000, latitude: 0.9, longitude: -77.8, metadata: { eventId: 'demo-2', status: 'revisado', agency: 'SGC' } },
  { id: 'demo-3', place: 'Venezuela', magnitude: 4.1, magnitudeLabel: '4.1', magnitudeType: 'M', depth: '31 km', time: '4:02 p. m.', timeLabel: 'Hoy · 4:02 p. m.', source: 'USGS', tone: 'green', timestamp: Date.now() - 5 * 60 * 60 * 1000, latitude: 9.2, longitude: -67.3, metadata: { eventId: 'demo-3', status: 'reviewed', agency: 'USGS' } },
]

const INITIAL_SOURCE_HEALTH = {
  SGC: { status: 'pending', count: 0, error: null, checkedAt: null, lastOkAt: null },
  USGS: { status: 'pending', count: 0, error: null, checkedAt: null, lastOkAt: null },
  EMSC: { status: 'pending', count: 0, error: null, checkedAt: null, lastOkAt: null },
}

const DEFAULT_EMERGENCY_CONTACTS = [
  { id: 'emergency-123', name: 'Emergencias', number: '123', note: 'Línea única nacional', isDefault: true },
  { id: 'red-cross-132', name: 'Cruz Roja', number: '132', note: 'Atención y socorro', isDefault: true },
  { id: 'firefighters-119', name: 'Bomberos', number: '119', note: 'Reporte de emergencias', isDefault: true },
]

const ALERT_SOUND_OPTIONS = ['intense', 'brief', 'silent']
const ALERT_SOURCE_OPTIONS = ['all', 'SGC', 'USGS', 'EMSC']
const DEFAULT_ALERT_RULE = { minMagnitude: 3, source: 'all', quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', sound: 'intense', maxAlertsPerUpdate: 3 }

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
  const paths = {
    activity: <path d="M3 12h4l2.2-7 4.1 14L16 12h5" />,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4" /><path d="M12 16h.01" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    download: <><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.5v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.4v-2.5h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2H15v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V15h-.2a1.7 1.7 0 0 0-1.5 0Z" /></>,
    settings: <><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65-2-3.46-2.49 1a7.3 7.3 0 0 0-1.69-.98L15 3h-4l-.37 2.93c-.6.25-1.17.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65 2 3.46 2.49-1c.52.4 1.09.73 1.69.98L11 21h4l.37-2.93c.6-.25 1.17-.58 1.69-.98l2.49 1 2-3.46-2.11-1.65Z" /><circle cx="13" cy="12" r="2.5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 10.5v5" /><path d="M12 7.5h.01" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.7 5.5 3.7 9S14.4 18.5 12 21M12 3C9.6 5.5 8.3 8.5 8.3 12s1.3 6.5 3.7 9" /></>,
    locate: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
    minus: <path d="M5 12h14" />,
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.9-3L3 11" /><path d="M3 5v6h6" /><path d="M4 13a8.1 8.1 0 0 0 14.9 3L21 13" /><path d="M21 19v-6h-6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    signal: <><path d="M5 20v-3" /><path d="M9.5 20v-6" /><path d="M14.5 20v-9" /><path d="M19 20V7" /></>,
    shield: <><path d="M12 3 20 6v5c0 5.1-3.3 8.7-8 10-4.7-1.3-8-4.9-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    windows: <><path d="M3 5.1 10.6 4v7H3zM12.7 3.7 21 2.5V11h-8.3zM3 12.9h7.6V20L3 18.8zM12.7 12.9H21v8.6l-8.3-1.2z" /></>,
    phone: <><path d="M6.6 3.5 9 3l1.6 4-1.8 1.5a13.8 13.8 0 0 0 6.7 6.7l1.5-1.8 4 1.6-.5 2.4a2 2 0 0 1-2.2 1.6C10.6 18.1 5.9 13.4 5 5.7a2 2 0 0 1 1.6-2.2Z" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function App() {
  const [activeTab, setActiveTab] = useState('live')
  const [booting, setBooting] = useState(true)
  const [notifications, setNotifications] = useState(() => readStoredValue('sismi-alerts', true))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastChecked, setLastChecked] = useState('iniciando…')
  const [events, setEvents] = useState(initialEvents)
  const [feedError, setFeedError] = useState(null)
  const [sourceStatus, setSourceStatus] = useState('SGC + USGS + EMSC')
  const [sourceHealth, setSourceHealth] = useState(INITIAL_SOURCE_HEALTH)
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [statusClock, setStatusClock] = useState(Date.now())
  const [theme, setTheme] = useState(() => readStoredValue('sismi-theme', 'light'))
  const [location, setLocation] = useState(() => readStoredValue('sismi-location', DEFAULT_LOCATION))
  const [locationMode, setLocationMode] = useState(() => readStoredValue('sismi-location-mode', 'search') === 'auto' ? 'auto' : 'search')
  const [locationStatus, setLocationStatus] = useState('Elige una ciudad o usa la ubicación de este equipo.')
  const [startWithWindows, setStartWithWindows] = useState(false)
  const [windowsPreferenceStatus, setWindowsPreferenceStatus] = useState('')
  const [doNotDisturb, setDoNotDisturb] = useState(() => readStoredValue('sismi-do-not-disturb', false))
  const [alertScope, setAlertScope] = useState(() => readStoredValue('sismi-alert-scope', 'nearby') === 'global' ? 'global' : 'nearby')
  const [alertRules, setAlertRules] = useState(readAlertRules)
  const [historyQuery, setHistoryQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [activeAlert, setActiveAlert] = useState(null)
  const [testNotificationStatus, setTestNotificationStatus] = useState('')
  const [updateState, setUpdateState] = useState({ status: 'idle', version: null, notes: '', percent: null })
  const [updateNoticeDismissed, setUpdateNoticeDismissed] = useState(false)
  const [mapSource, setMapSource] = useState('all')
  const [mapMinMagnitude, setMapMinMagnitude] = useState(0)
  const [mapTimeRange, setMapTimeRange] = useState('all')
  const [mapQuery, setMapQuery] = useState('')
  const [mapOnlyNearby, setMapOnlyNearby] = useState(false)
  const [mapTimelineAt, setMapTimelineAt] = useState(null)
  const notificationsRef = useRef(notifications)
  const doNotDisturbRef = useRef(doNotDisturb)
  const locationRef = useRef(location)
  const alertScopeRef = useRef(alertScope)
  const activeAlertRule = alertRules[alertScope]
  const minMagnitudeRef = useRef(activeAlertRule.minMagnitude)
  const alertSourceRef = useRef(activeAlertRule.source)
  const quietHoursEnabledRef = useRef(activeAlertRule.quietHoursEnabled)
  const quietHoursStartRef = useRef(activeAlertRule.quietHoursStart)
  const quietHoursEndRef = useRef(activeAlertRule.quietHoursEnd)
  const alertSoundRef = useRef(activeAlertRule.sound)
  const maxAlertsPerUpdateRef = useRef(activeAlertRule.maxAlertsPerUpdate)
  const knownEventIds = useRef(new Set(initialEvents.map((event) => getEventKey(event))))
  const detectedAtByKey = useRef(new Map())
  const hasLoadedFeed = useRef(false)
  const lastSuccessfulFeedAt = useRef(0)
  const feedRequestInFlight = useRef(false)
  const realtimeEventsRef = useRef(new Map())
  const knownEventsRef = useRef([...initialEvents])
  const emscConnectedRef = useRef(false)
  const previousLocationKey = useRef(null)
  const alertedEventKeys = useRef(new Set())
  const updateRequestInFlight = useRef(false)
  const updateNoticeShown = useRef(false)
  const staleNoticeShown = useRef(false)
  const loaderStartedAt = useRef(Date.now())
  const loaderFinished = useRef(false)

  const last24Hours = Date.now() - 24 * 60 * 60 * 1000
  const nearbyEvents = useMemo(() => events.filter((event) => event.timestamp >= last24Hours && isNearby(event, location)), [events, location, last24Hours])
  const scopedEvents = useMemo(() => alertScope === 'global' ? events : events.filter((event) => isNearby(event, location)), [alertScope, events, location])
  const scopedRecentEvents = useMemo(() => scopedEvents.filter((event) => event.timestamp >= last24Hours), [last24Hours, scopedEvents])
  const latestNearby = nearbyEvents[0]
  const latest = latestNearby || events[0] || initialEvents[0]
  const nearbyCount = countNearby(events, location)
  const latestDistance = distanceBetween(location, latest)
  const filteredEvents = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    if (!query) return scopedEvents
    return scopedEvents.filter((event) => [event.place, event.source, event.id, event.metadata?.title, event.metadata?.agency].filter(Boolean).join(' ').toLowerCase().includes(query))
  }, [historyQuery, scopedEvents])
  const mapBaseEvents = useMemo(() => filterMapEvents(events, { source: mapSource, minMagnitude: mapMinMagnitude, timeRange: mapTimeRange, query: mapQuery, onlyNearby: mapOnlyNearby, location }), [events, location, mapMinMagnitude, mapOnlyNearby, mapQuery, mapSource, mapTimeRange])
  const filteredMapEvents = useMemo(() => mapTimelineAt === null ? mapBaseEvents : mapBaseEvents.filter((event) => event.timestamp <= mapTimelineAt), [mapBaseEvents, mapTimelineAt])
  const mapTimelineBounds = useMemo(() => {
    if (mapBaseEvents.length === 0) return { min: 0, max: 0 }
    const timestamps = mapBaseEvents.map((event) => event.timestamp)
    return { min: Math.min(...timestamps), max: Math.max(...timestamps) }
  }, [mapBaseEvents])
  const dataIsStale = Boolean(lastSyncAt && statusClock - lastSyncAt >= DATA_STALE_AFTER_MS)
  const statusLabel = feedError ? 'Sin conexión' : dataIsStale ? 'Datos atrasados' : doNotDisturb ? 'No molestar' : notifications ? 'Vigilancia activa' : 'Avisos pausados'
  const monitoringLabel = alertScope === 'global' ? 'Todo el mundo' : location.label

  function updateAlertRule(field, value) {
    setAlertRules((current) => ({ ...current, [alertScope]: { ...current[alertScope], [field]: value } }))
  }

  useEffect(() => { notificationsRef.current = notifications; writeStoredValue('sismi-alerts', notifications) }, [notifications])
  useEffect(() => { doNotDisturbRef.current = doNotDisturb; writeStoredValue('sismi-do-not-disturb', doNotDisturb) }, [doNotDisturb])
  useEffect(() => {
    const interval = window.setInterval(() => setStatusClock(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => { locationRef.current = location; writeStoredValue('sismi-location', location) }, [location])
  useEffect(() => {
    const nextLocationKey = [location.lat, location.lon].map((value) => Number(value).toFixed(5)).join(':')
    if (previousLocationKey.current === null) {
      previousLocationKey.current = nextLocationKey
      return
    }
    if (previousLocationKey.current === nextLocationKey) return

    previousLocationKey.current = nextLocationKey
    setAlertScope('nearby')
    setHistoryQuery('')
    setSelectedEvent(null)
    setActiveAlert(null)
    loadFeed()
  }, [location.lat, location.lon])
  useEffect(() => { writeStoredValue('sismi-location-mode', locationMode) }, [locationMode])
  useEffect(() => {
    alertScopeRef.current = alertScope
    minMagnitudeRef.current = activeAlertRule.minMagnitude
    alertSourceRef.current = activeAlertRule.source
    quietHoursEnabledRef.current = activeAlertRule.quietHoursEnabled
    quietHoursStartRef.current = activeAlertRule.quietHoursStart
    quietHoursEndRef.current = activeAlertRule.quietHoursEnd
    alertSoundRef.current = activeAlertRule.sound
    maxAlertsPerUpdateRef.current = activeAlertRule.maxAlertsPerUpdate
    writeStoredValue('sismi-alert-scope', alertScope)
    writeStoredValue('sismi-alert-rules', alertRules)
  }, [activeAlertRule, alertRules, alertScope])
  useEffect(() => { document.documentElement.dataset.theme = theme; writeStoredValue('sismi-theme', theme) }, [theme])
  useEffect(() => {
    if (!isDesktopApp()) return undefined
    let active = true
    getStartWithWindows()
      .then((enabled) => { if (active) setStartWithWindows(enabled) })
      .catch(() => { if (active) setWindowsPreferenceStatus('No pudimos comprobar el inicio automático.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (mapTimelineAt === null || mapTimelineBounds.max === 0) return
    if (mapTimelineAt < mapTimelineBounds.min) setMapTimelineAt(mapTimelineBounds.min)
    if (mapTimelineAt > mapTimelineBounds.max) setMapTimelineAt(mapTimelineBounds.max)
  }, [mapTimelineAt, mapTimelineBounds])
  useEffect(() => {
    if (!dataIsStale) {
      staleNoticeShown.current = false
      return
    }
    if (staleNoticeShown.current || doNotDisturb || !notifications) return
    staleNoticeShown.current = true
    notifyDesktop({ title: 'Sismi · Datos atrasados', body: 'No recibimos eventos nuevos en varios minutos. Revisa tu conexión.', tag: 'sismi-data-stale', sound: false }).catch(() => {})
  }, [dataIsStale, doNotDisturb, notifications])
  useEffect(() => {
    if (isDesktopApp()) document.documentElement.classList.add('native-window')
    return () => document.documentElement.classList.remove('native-window')
  }, [])
  useEffect(() => {
    if (!isDesktopApp()) return undefined
    const timer = window.setTimeout(() => checkForAppUpdate({ automatic: true }), 1800)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    loadFeed(controller.signal)
    const interval = window.setInterval(() => loadFeed(), 30000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [])
  useEffect(() => subscribeEmscRealtime({
    onStatus: ({ status, error }) => {
      const checkedAt = Date.now()
      const connected = status === 'connected'
      emscConnectedRef.current = connected
      setSourceHealth((current) => ({
        ...current,
        EMSC: {
          ...current.EMSC,
          status: connected ? 'ok' : status === 'connecting' ? 'pending' : 'error',
          count: realtimeEventsRef.current.size,
          error: error || null,
          checkedAt,
          lastOkAt: connected ? checkedAt : current.EMSC?.lastOkAt || null,
        },
      }))
    },
    onEvent: handleEmscEvent,
  }), [])

  async function loadFeed(signal) {
    if (feedRequestInFlight.current) return
    feedRequestInFlight.current = true
    setRefreshing(true)
    try {
      const freshEventsFromSources = await fetchEarthquakes(signal, (status) => {
        const checkedAt = Date.now()
        setSourceHealth((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(status).map(([source, next]) => [source, {
            ...current[source],
            ...next,
            checkedAt,
            lastOkAt: next.status === 'ok' ? checkedAt : current[source]?.lastOkAt || null,
          }])),
        }))
      })
      const freshEvents = mergeEarthquakeEvents([...freshEventsFromSources, ...realtimeEventsRef.current.values()])
      const detectedAt = Date.now()
      const alertCutoff = lastSuccessfulFeedAt.current - 15 * 60 * 1000
      const newEvents = hasLoadedFeed.current
        ? freshEvents.filter((event) => !isKnownEarthquake(event, knownEventsRef.current) && event.timestamp >= alertCutoff)
        : []
      newEvents.forEach((event) => detectedAtByKey.current.set(getEventKey(event), detectedAt))
      const eventsWithDetection = freshEvents.map((event) => ({ ...event, detectedAt: detectedAtByKey.current.get(getEventKey(event)) }))
      const newlyDetectedEvents = newEvents.map((event) => ({ ...event, detectedAt: detectedAtByKey.current.get(getEventKey(event)) }))
      setEvents(eventsWithDetection)
      const activeSources = [...new Set(freshEvents.map((event) => event.source))]
      if (emscConnectedRef.current && !activeSources.includes('EMSC')) activeSources.push('EMSC')
      setSourceStatus(activeSources.join(' + '))
      freshEvents.forEach((event) => knownEventIds.current.add(getEventKey(event)))
      knownEventsRef.current = mergeEarthquakeEvents([...knownEventsRef.current, ...freshEvents])
      hasLoadedFeed.current = true
      lastSuccessfulFeedAt.current = Date.now()
      setLastSyncAt(detectedAt)
      if (notificationsRef.current && newlyDetectedEvents.length > 0) announceAlerts(newlyDetectedEvents, locationRef.current, minMagnitudeRef.current, alertScopeRef.current, alertSourceRef.current)
      setFeedError(null)
      setLastChecked(formatClock(detectedAt))
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Sismi no pudo actualizar los eventos', error)
        setFeedError('No pudimos traer información nueva')
        setLastChecked('sin actualizar')
      }
    } finally {
      feedRequestInFlight.current = false
      setRefreshing(false)
      if (!loaderFinished.current && !signal?.aborted) {
        loaderFinished.current = true
        const remaining = Math.max(0, 1100 - (Date.now() - loaderStartedAt.current))
        window.setTimeout(() => setBooting(false), remaining)
      }
    }
  }

  function handleEmscEvent(event) {
    realtimeEventsRef.current.set(event.id, event)
    const alreadyKnown = isKnownEarthquake(event, knownEventsRef.current)
    knownEventsRef.current = mergeEarthquakeEvents([...knownEventsRef.current, event])
    setSourceHealth((current) => ({
      ...current,
      EMSC: { ...current.EMSC, count: realtimeEventsRef.current.size, status: 'ok', error: null, checkedAt: Date.now() },
    }))
    setEvents((current) => mergeEarthquakeEvents([...current, event]))

    if (!alreadyKnown && hasLoadedFeed.current) {
      const detectedAt = Date.now()
      detectedAtByKey.current.set(getEventKey(event), detectedAt)
      setLastChecked(formatClock(detectedAt))
      if (notificationsRef.current) announceAlerts([{ ...event, detectedAt }], locationRef.current, minMagnitudeRef.current, alertScopeRef.current, alertSourceRef.current)
    }
  }

  async function toggleNotifications() {
    if (!notifications && !(await requestNotificationPermission())) {
      setLocationStatus('Activa los avisos de Windows para recibir alertas.')
      return
    }
    setNotifications((current) => !current)
  }

  function toggleDoNotDisturb() {
    setDoNotDisturb((current) => !current)
  }

  async function toggleStartWithWindows() {
    const nextValue = !startWithWindows
    setStartWithWindows(nextValue)
    setWindowsPreferenceStatus(nextValue ? 'Guardando preferencia…' : 'Desactivando inicio automático…')
    try {
      await setStartWithWindowsNative(nextValue)
      setWindowsPreferenceStatus(nextValue ? 'Sismi iniciará oculto en la bandeja de Windows.' : 'Inicio automático desactivado.')
    } catch {
      setStartWithWindows(!nextValue)
      setWindowsPreferenceStatus('No pudimos cambiar esta preferencia.')
    }
  }

  async function testNotification() {
    setTestNotificationStatus('Solicitando permiso…')
    const permissionGranted = await requestNotificationPermission()
    if (!permissionGranted) {
      setTestNotificationStatus('Los avisos de Windows están desactivados. Revísalos en Configuración.')
      return
    }
    const testTime = Date.now()
    const testAlert = { id: 'test-alert', place: 'Simulación de Sismi', magnitudeLabel: '4.8', magnitudeType: 'ML', depth: '12 km', source: 'PRUEBA', tone: 'amber', timeLabel: 'Ahora', timestamp: testTime, detectedAt: testTime, isTest: true }
    setActiveAlert(testAlert)
    await playAlertSound(alertSoundRef.current)
    await notifyEvent(testAlert, alertSoundRef.current)
    setTestNotificationStatus('Alerta enviada correctamente.')
  }

  async function checkForAppUpdate({ install = false, automatic = false } = {}) {
    if (updateRequestInFlight.current) return
    updateRequestInFlight.current = true
    setUpdateState((current) => ({ ...current, status: install ? 'downloading' : 'checking', percent: install ? 0 : null }))
    try {
      const result = await checkForSismiUpdate({
        install,
        onProgress: ({ percent }) => setUpdateState((current) => ({ ...current, status: 'downloading', percent })),
      })
      if (result.status === 'available') {
        setUpdateNoticeDismissed(false)
        if (automatic && !updateNoticeShown.current) {
          updateNoticeShown.current = true
          try {
            await notifyDesktop({ title: `Nueva versión de Sismi · v${result.version}`, body: 'Ya puedes descargarla desde el panel de Sismi.', tag: 'sismi-update-available' })
          } catch {
            // El aviso dentro de Sismi sigue disponible si Windows no muestra la notificación.
          }
        }
      }
      setUpdateState((current) => ({ ...current, ...result, percent: result.status === 'available' ? null : current.percent }))
    } catch (error) {
      setUpdateState((current) => ({ ...current, status: automatic ? 'unavailable' : 'error', error: error?.message || '' }))
    } finally {
      updateRequestInFlight.current = false
    }
  }

  async function announceAlerts(candidateEvents, center, threshold, scope, source) {
    if (doNotDisturbRef.current) return
    if (quietHoursEnabledRef.current && isQuietHoursNow(quietHoursStartRef.current, quietHoursEndRef.current)) return

    const eligibleEvents = candidateEvents.filter((event) => (
      event.magnitude >= threshold
      && (scope === 'global' || isNearby(event, center))
      && (source === 'all' || event.source === source)
      && !alertedEventKeys.current.has(getEventKey(event))
    ))
    if (eligibleEvents.length === 0) return

    eligibleEvents.forEach((event) => alertedEventKeys.current.add(getEventKey(event)))
    const eventsToNotify = eligibleEvents.slice(0, maxAlertsPerUpdateRef.current)
    setActiveAlert(eventsToNotify[0])
    if (alertSoundRef.current !== 'silent') await playAlertSound(alertSoundRef.current)
    await Promise.allSettled(eventsToNotify.map((event) => notifyEvent(event, alertSoundRef.current)))
  }

  function selectSearchedLocation(place) {
    const radiusKm = place.isCountry ? Math.max(location.radiusKm, 800) : location.radiusKm
    setLocation({ label: place.label, lat: place.latitude, lon: place.longitude, radiusKm, isCountry: Boolean(place.isCountry), countryCode: place.countryCode || null })
    setLocationMode('search')
    setLocationStatus(`Avisos configurados para ${place.label}.`)
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) { setLocationStatus('Este dispositivo no permite obtener la ubicación automáticamente.'); return }
    setLocationStatus('Solicitando permiso de ubicación…')
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = Number(position.coords.latitude.toFixed(5))
      const lon = Number(position.coords.longitude.toFixed(5))
      setLocation({ label: 'Ubicación actual', lat, lon, radiusKm: location.radiusKm, isCountry: false, countryCode: null })
      setLocationMode('auto')
      setLocationStatus('Usaremos la ubicación de este equipo.')
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED ? 'No diste permiso. También puedes elegir una ciudad.' : 'No pudimos obtener tu ubicación.')
      setLocationMode('search')
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 })
  }

  function updateRadius(value) { setLocation((current) => ({ ...current, radiusKm: Number(value) })) }
  function toggleTheme() { setTheme((current) => current === 'dark' ? 'light' : 'dark') }

  return (
    <main className="desktop-stage">
      <section className="panel" aria-label="Panel de monitoreo sísmico">
        {booting && <AppLoader />}
        <header className="app-bar" data-tauri-drag-region="true">
          <div className="brand-lockup">
            <img className="brand-logo" src="/sismi-logo.png" alt="" />
            <div><h1>Sismi</h1><p>Alerta sísmica</p></div>
          </div>
          <div className="window-actions">
            <button className="icon-button" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
            <button className="icon-button" title="Modo seguridad" aria-label="Abrir modo seguridad" onClick={() => { setAboutOpen(false); setSafetyOpen(true); setSettingsOpen(true) }}><Icon name="shield" size={16} /></button>
            <button className="icon-button" title="Configuración" aria-label="Configuración" onClick={() => { setAboutOpen(false); setSafetyOpen(false); setSettingsOpen(true) }}><Icon name="settings" size={17} /></button>
            <button className="icon-button" title="Ocultar" aria-label="Ocultar en la bandeja" onClick={minimizeDesktopWindow}><Icon name="minus" size={17} /></button>
            <button className="icon-button close-button" title="Cerrar" aria-label="Ocultar en la bandeja" onClick={closeDesktopWindow}><Icon name="close" size={16} /></button>
          </div>
        </header>

        <div className="monitor-bar">
          <div className="monitor-state"><span className={`status-dot ${feedError || !notifications ? 'is-paused' : dataIsStale ? 'is-stale' : 'is-live'}`} /><strong>{statusLabel}</strong><span>· {monitoringLabel}</span></div>
          <button className={`refresh-button ${refreshing ? 'is-refreshing' : ''}`} onClick={() => loadFeed()} aria-label="Actualizar datos"><Icon name="refresh" size={14} /><span>{lastChecked}</span></button>
        </div>

        {feedError && <div className="feed-alert" role="status">{feedError}. Mostrando los últimos registros.</div>}
        {dataIsStale && !feedError && <div className="feed-alert stale-data-alert" role="status">No hay datos nuevos desde {formatSyncTime(lastSyncAt)}. Revisa la conexión o pulsa Actualizar.</div>}
        {(updateState.status === 'available' || updateState.status === 'downloading') && !updateNoticeDismissed && <UpdateBanner version={updateState.version} downloading={updateState.status === 'downloading'} percent={updateState.percent} onInstall={() => checkForAppUpdate({ install: true })} onDismiss={() => setUpdateNoticeDismissed(true)} />}
        {activeAlert && <EarthquakeAlert event={activeAlert} onClose={() => setActiveAlert(null)} onSafety={() => { setActiveAlert(null); setAboutOpen(false); setSafetyOpen(true); setSettingsOpen(true) }} />}

        <nav className="tabs" aria-label="Secciones">
          <button className={activeTab === 'live' ? 'active' : ''} onClick={() => setActiveTab('live')}>Ahora</button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>Historial <span>{scopedEvents.length}</span></button>
          <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}><Icon name="globe" size={14} />Mapa</button>
        </nav>

        {!selectedEvent && (activeTab === 'live' ? (
          <div className="content-stack">
            <article className="latest-card">
              <div className="card-topline"><span className="live-label"><span />{latestNearby ? 'En tu zona' : 'Último sismo'}</span><time>{latest.timeLabel || latest.time}</time></div>
              <div className="event-primary">
                <div className="magnitude-value"><strong>{latest.magnitudeLabel}</strong><span>{latest.magnitudeType}</span></div>
                <div className="event-heading"><h2>{latest.place}</h2><p>{latest.source} · {latest.metadata?.status || 'registrado'}</p></div>
              </div>
              <div className="event-facts">
                <div><span>Profundidad</span><strong>{latest.depth}</strong></div>
                <div><span>Distancia</span><strong>{Number.isFinite(latestDistance) ? `${latestDistance} km` : '—'}</strong></div>
                <div><span>Fuente</span><strong>{latest.source}</strong></div>
              </div>
              <button className="primary-button" onClick={() => setSelectedEvent(latest)}>Ver información completa <Icon name="chevron" size={15} /></button>
            </article>

            <div className="quick-grid">
              <div className="quick-stat"><span>Sismos cercanos</span><strong>{nearbyCount}</strong><small>últimas 24 horas</small></div>
              <div className="quick-stat"><span>{alertScope === 'global' ? 'Cobertura de alertas' : 'Radio activo'}</span><strong>{alertScope === 'global' ? 'Mundial' : `${location.radiusKm} km`}</strong><small>{alertScope === 'global' ? `Magnitud mínima ${Number(activeAlertRule.minMagnitude).toFixed(1)}` : location.label}</small></div>
            </div>

            <section className="recent-section">
              <div className="section-title"><div className="section-heading-copy"><h3>Actividad reciente</h3><span className="section-context">{alertScope === 'global' ? 'Todo el mundo' : 'Mi zona'}</span></div><button onClick={() => setActiveTab('history')}>Ver todo <Icon name="chevron" size={14} /></button></div>
              <div className="event-list">{scopedRecentEvents.length > 0 ? scopedRecentEvents.slice(0, 3).map((event) => <EventRow key={event.id} event={event} distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="activity-empty"><Icon name={alertScope === 'global' ? 'globe' : 'locate'} size={18} /><span>{alertScope === 'global' ? 'No hay sismos registrados en las últimas 24 horas.' : 'No hay sismos recientes dentro de tu zona.'}</span></div>}</div>
            </section>

            <div className="location-summary"><span className="location-icon"><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><span>{location.isCountry ? 'Cobertura nacional' : `Distancia de aviso: ${location.radiusKm} km`}</span></div><button onClick={() => { setAboutOpen(false); setSafetyOpen(false); setSettingsOpen(true) }}>Cambiar</button></div>
          </div>
        ) : activeTab === 'history' ? (
          <div className="history-panel">
            <div className="history-intro"><div><p>Registros de {alertScope === 'global' ? 'todo el mundo' : 'mi zona'}</p><h2>Historial sísmico</h2></div><span>{filteredEvents.length}</span></div>
            <div className="history-scope-row"><span>Mostrar</span><div className="history-scope-toggle"><button className={alertScope === 'nearby' ? 'selected' : ''} onClick={() => setAlertScope('nearby')}><Icon name="locate" size={13} />Mi zona</button><button className={alertScope === 'global' ? 'selected' : ''} onClick={() => setAlertScope('global')}><Icon name="globe" size={13} />Todo el mundo</button></div></div>
            <label className="search-field"><Icon name="search" size={16} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Busca por lugar o fuente" aria-label="Buscar en el historial" />{historyQuery && <button onClick={() => setHistoryQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
            <div className="history-results">{filteredEvents.length > 0 ? filteredEvents.map((event) => <EventRow key={event.id} event={event} detailed distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="empty-state"><Icon name="search" size={21} /><strong>No encontramos sismos</strong><span>Intenta buscar otro lugar o fuente.</span></div>}</div>
          </div>
        ) : (
          <GlobalMapPanel events={filteredMapEvents} totalEvents={events.length} location={location} source={mapSource} setSource={(value) => { setMapSource(value); setMapTimelineAt(null) }} minMagnitude={mapMinMagnitude} setMinMagnitude={(value) => { setMapMinMagnitude(value); setMapTimelineAt(null) }} timeRange={mapTimeRange} setTimeRange={(value) => { setMapTimeRange(value); setMapTimelineAt(null) }} query={mapQuery} setQuery={(value) => { setMapQuery(value); setMapTimelineAt(null) }} onlyNearby={mapOnlyNearby} setOnlyNearby={(value) => { setMapOnlyNearby(value); setMapTimelineAt(null) }} timelineEvents={mapBaseEvents} timelineAt={mapTimelineAt} setTimelineAt={setMapTimelineAt} timelineMin={mapTimelineBounds.min} timelineMax={mapTimelineBounds.max} onSelect={setSelectedEvent} />
        ))}

        {settingsOpen && <SettingsDrawer {...{ location, locationMode, setLocationMode, locationStatus, minMagnitude: activeAlertRule.minMagnitude, setMinMagnitude: (value) => updateAlertRule('minMagnitude', value), alertScope, setAlertScope, alertSource: activeAlertRule.source, setAlertSource: (value) => updateAlertRule('source', value), quietHoursEnabled: activeAlertRule.quietHoursEnabled, setQuietHoursEnabled: (value) => updateAlertRule('quietHoursEnabled', value), quietHoursStart: activeAlertRule.quietHoursStart, setQuietHoursStart: (value) => updateAlertRule('quietHoursStart', value), quietHoursEnd: activeAlertRule.quietHoursEnd, setQuietHoursEnd: (value) => updateAlertRule('quietHoursEnd', value), alertSound: activeAlertRule.sound, setAlertSound: (value) => updateAlertRule('sound', value), maxAlertsPerUpdate: activeAlertRule.maxAlertsPerUpdate, setMaxAlertsPerUpdate: (value) => updateAlertRule('maxAlertsPerUpdate', value), notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, sourceHealth, lastSyncAt, refreshing, refreshNow: () => loadFeed(), safetyOpen, setSafetyOpen, aboutOpen, setAboutOpen, updateState, checkForAppUpdate, close: () => setSettingsOpen(false), startWithWindows, toggleStartWithWindows, windowsPreferenceStatus, doNotDisturb, toggleDoNotDisturb, dataIsStale }} />}
        {selectedEvent && <EventDetails event={selectedEvent} distanceKm={distanceBetween(location, selectedEvent)} onClose={() => setSelectedEvent(null)} />}

        <footer className="panel-footer"><span><Icon name="signal" size={14} /> {sourceStatus || 'Fuentes'} activas</span><span>v{APP_VERSION}</span></footer>
      </section>
    </main>
  )
}

function AppLoader() {
  return <div className="app-loader" role="status" aria-live="polite"><div className="loader-logo-wrap"><span className="loader-ring" /><img src="/sismi-logo.png" alt="" /></div><strong>Cargando Sismi</strong><span>Consultando información sísmica</span><div className="loader-progress"><i /></div></div>
}

function EarthquakeAlert({ event, onClose, onSafety }) {
  return <div className="earthquake-alert" role="alert"><span className="earthquake-alert-icon"><Icon name="bell" size={18} /></span><div><small>{event.isTest ? 'AVISO DE PRUEBA' : 'ALERTA DE SISMO'}</small><strong>Magnitud {event.magnitudeLabel} · {event.place}</strong><p>{event.depth} · {event.source}{event.detectedAt ? ` · Recibido ${formatClock(event.detectedAt)}` : ''}</p><button className="alert-safety-link" onClick={onSafety}><Icon name="shield" size={13} />Qué hacer ahora</button></div><button onClick={onClose} aria-label="Cerrar alerta"><Icon name="close" size={15} /></button></div>
}

function SettingsDrawer({ location, locationMode, setLocationMode, locationStatus, minMagnitude, setMinMagnitude, alertScope, setAlertScope, alertSource, setAlertSource, quietHoursEnabled, setQuietHoursEnabled, quietHoursStart, setQuietHoursStart, quietHoursEnd, setQuietHoursEnd, alertSound, setAlertSound, maxAlertsPerUpdate, setMaxAlertsPerUpdate, notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, sourceHealth, lastSyncAt, refreshing, refreshNow, safetyOpen, setSafetyOpen, aboutOpen, setAboutOpen, updateState, checkForAppUpdate, close, startWithWindows, toggleStartWithWindows, windowsPreferenceStatus, doNotDisturb, toggleDoNotDisturb, dataIsStale }) {
  return (
    <aside className="settings-drawer" aria-label="Configuración de Sismi">
      <header className="drawer-heading"><div><button className="back-button" onClick={safetyOpen ? () => setSafetyOpen(false) : aboutOpen ? () => setAboutOpen(false) : close} aria-label={safetyOpen || aboutOpen ? 'Volver a configuración' : 'Volver'}><Icon name="back" size={17} /></button><div><h2>{safetyOpen ? 'Modo seguridad' : aboutOpen ? 'Acerca de Sismi' : 'Configuración'}</h2><p>{safetyOpen ? 'Guía disponible sin conexión' : aboutOpen ? 'Información de Sismi' : 'Preferencias de avisos'}</p></div></div><button className="icon-button" onClick={close} aria-label="Cerrar configuración"><Icon name="close" size={16} /></button></header>
      {safetyOpen ? <SafetyPanel /> : aboutOpen ? <AboutPanel updateState={updateState} checkForAppUpdate={checkForAppUpdate} /> : <div className="settings-content">
        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="locate" size={16} /></span><div><strong>Ubicación</strong><span>Lugar desde el que recibirás avisos</span></div></div>
          <div className="segmented"><button className={locationMode === 'search' ? 'selected' : ''} onClick={() => setLocationMode('search')}>Elegir ciudad</button><button className={locationMode === 'auto' ? 'selected' : ''} onClick={requestCurrentLocation}>Usar mi ubicación</button></div>
          {locationMode === 'search' ? <LocationSearch currentLocation={location} onSelect={selectSearchedLocation} /> : <div className="selected-location"><span><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><small>Ubicación de este equipo</small></div><Icon name="check" size={17} /></div>}
          <label className="range-field"><span><span>Distancia de aviso</span><strong>{location.radiusKm} km</strong></span><input type="range" min="25" max="1000" step="25" value={location.radiusKm} onChange={(event) => updateRadius(event.target.value)} /></label>
          <p className="setting-note">{locationStatus}</p>
        </section>

        <DataStatusSection sourceHealth={sourceHealth} lastSyncAt={lastSyncAt} refreshing={refreshing} onRefresh={refreshNow} />

        <section className="settings-section safety-entry-section">
          <button className="safety-entry" onClick={() => setSafetyOpen(true)}><span className="safety-entry-icon"><Icon name="shield" size={17} /></span><span><strong>Modo seguridad</strong><small>Qué hacer y a quién llamar durante una emergencia</small></span><Icon name="chevron" size={16} /></button>
        </section>

        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="activity" size={16} /></span><div><strong>Alertas</strong><span>Elige qué sismos quieres recibir</span></div></div>
          <div className="alert-scope-label"><span>Regla activa para estos avisos</span><strong>{alertScope === 'global' ? 'Todo el mundo' : 'Mi zona'}</strong></div>
          <div className="alert-scope-picker" role="group" aria-label="Dónde recibir avisos">
            <button className={alertScope === 'nearby' ? 'selected' : ''} onClick={() => setAlertScope('nearby')} aria-pressed={alertScope === 'nearby'}><span><Icon name="locate" size={17} /></span><div><strong>Mi zona</strong><small>{location.isCountry ? `En todo ${location.label}` : `Dentro de ${location.radiusKm} km de ${location.label}`}</small></div>{alertScope === 'nearby' && <Icon name="check" size={17} />}</button>
            <button className={alertScope === 'global' ? 'selected' : ''} onClick={() => setAlertScope('global')} aria-pressed={alertScope === 'global'}><span><Icon name="globe" size={17} /></span><div><strong>Todo el mundo</strong><small>Recibe avisos de cualquier país</small></div>{alertScope === 'global' && <Icon name="check" size={17} />}</button>
          </div>
          <p className="setting-note">Estas preferencias se guardan por separado para Mi zona y Todo el mundo.</p>
          <label className="range-field"><span><span>Magnitud mínima</span><strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="1" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <label className="select-field"><span>Fuente de los avisos</span><select value={alertSource} onChange={(event) => setAlertSource(event.target.value)} aria-label="Fuente de los avisos"><option value="all">SGC, USGS y EMSC</option><option value="SGC">Solo SGC</option><option value="USGS">Solo USGS</option><option value="EMSC">Solo EMSC</option></select></label>
          <label className="select-field"><span>Máximo de avisos por actualización</span><select value={maxAlertsPerUpdate} onChange={(event) => setMaxAlertsPerUpdate(Number(event.target.value))} aria-label="Máximo de avisos por actualización">{[1, 3, 5, 10].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'aviso' : 'avisos'}</option>)}</select></label>
          <div className="setting-row"><div><strong>Sonido de alerta</strong><span>Elige cómo quieres escucharla</span></div><select className="inline-select" value={alertSound} onChange={(event) => setAlertSound(event.target.value)} aria-label="Sonido de alerta"><option value="intense">Alerta intensa</option><option value="brief">Aviso corto</option><option value="silent">Solo aviso visual</option></select></div>
          <div className="setting-row quiet-setting-row"><div><strong>Horario silencioso</strong><span>Silencia avisos y sonidos durante este horario</span></div><button className={`toggle ${quietHoursEnabled ? 'on' : ''}`} onClick={() => setQuietHoursEnabled((current) => !current)} aria-label="Activar o desactivar horario silencioso" aria-pressed={quietHoursEnabled}><span /></button></div>
          {quietHoursEnabled && <div className="quiet-hours-fields"><label>Desde<input type="time" value={quietHoursStart} onChange={(event) => setQuietHoursStart(event.target.value)} aria-label="Inicio del horario silencioso" /></label><label>Hasta<input type="time" value={quietHoursEnd} onChange={(event) => setQuietHoursEnd(event.target.value)} aria-label="Fin del horario silencioso" /></label><p>Los sismos seguirán apareciendo en el historial, pero no enviarán aviso durante este horario.</p></div>}
          <p className="alert-rule-note"><Icon name="check" size={14} /><span>{alertScope === 'global' ? 'Todo el mundo avisa sin filtrar por distancia.' : `Mi zona respeta el radio de ${location.radiusKm} km.`} La magnitud mínima y la fuente elegida también se aplican.</span></p>
          <div className="setting-row"><div><strong>Avisos en el escritorio</strong><span>Sonido y aviso de Windows</span></div><button className={`toggle ${notifications ? 'on' : ''}`} onClick={toggleNotifications} aria-label="Activar o desactivar avisos"><span /></button></div>
          <button className="secondary-button" onClick={testNotification}><Icon name="bell" size={15} /> Probar aviso</button>
          <p className="test-alert-status" role="status">{testNotificationStatus || 'Haz una prueba para confirmar que todo funciona.'}</p>
          <div className="alert-safety-note"><Icon name="check" size={14} /><span>Un mismo evento no vuelve a avisarse mientras conserve su identificador.</span></div>
        </section>

        <section className="settings-section appearance-section">
          <div className="section-heading"><span className="section-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></span><div><strong>Apariencia</strong><span>{theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}</span></div></div>
          <button className="theme-choice" onClick={toggleTheme}><span>{theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}</span><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        </section>
        <section className="settings-section windows-section">
          <div className="section-heading"><span className="section-icon"><Icon name="windows" size={16} /></span><div><strong>Modo Windows</strong><span>Controla cómo funciona Sismi en tu equipo</span></div></div>
          <div className="setting-row windows-setting-row"><div><strong>Iniciar con Windows</strong><span>Se abrirá oculto y quedará en la bandeja</span></div><button className={`toggle ${startWithWindows ? 'on' : ''}`} onClick={toggleStartWithWindows} aria-label="Activar o desactivar inicio con Windows" aria-pressed={startWithWindows}><span /></button></div>
          <div className="setting-row"><div><strong>No molestar</strong><span>Detiene sonidos y avisos mientras esté activo</span></div><button className={`toggle ${doNotDisturb ? 'on' : ''}`} onClick={toggleDoNotDisturb} aria-label="Activar o desactivar No molestar" aria-pressed={doNotDisturb}><span /></button></div>
          <div className={`data-freshness ${dataIsStale ? 'is-stale' : ''}`}><span className="data-freshness-icon"><Icon name={dataIsStale ? 'alert' : lastSyncAt ? 'check' : 'refresh'} size={15} /></span><div><strong>{dataIsStale ? 'Datos atrasados' : lastSyncAt ? 'Datos al día' : 'Esperando datos'}</strong><span>{dataIsStale ? 'La aplicación lleva varios minutos sin recibir eventos nuevos.' : lastSyncAt ? `Última consulta: ${formatSyncTime(lastSyncAt)}` : 'Aún no hay una sincronización confirmada.'}</span></div></div>
          {windowsPreferenceStatus && <p className="setting-note windows-preference-status" role="status">{windowsPreferenceStatus}</p>}
        </section>
        <section className="settings-section about-entry-section">
          <button className="about-entry" onClick={() => setAboutOpen(true)}><span className="about-entry-icon"><Icon name="info" size={17} /></span><span><strong>Acerca de Sismi</strong><small>Conoce Sismi y sus funciones</small></span><Icon name="chevron" size={16} /></button>
        </section>
      </div>}
    </aside>
  )
}

function DataStatusSection({ sourceHealth, lastSyncAt, refreshing, onRefresh }) {
  const sources = [['SGC', 'Servicio Geológico Colombiano'], ['USGS', 'Servicio Geológico de Estados Unidos'], ['EMSC', 'Detección sísmica internacional']]
  return <section className="settings-section data-status-section">
    <div className="section-heading"><span className="section-icon"><Icon name="signal" size={16} /></span><div><strong>Estado de datos</strong><span>Consulta de fuentes oficiales</span></div></div>
    <div className="data-status-summary"><div><span>Última sincronización</span><strong>{lastSyncAt ? formatSyncTime(lastSyncAt) : 'Aún no disponible'}</strong></div><button className="mini-refresh-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" size={13} />{refreshing ? 'Actualizando…' : 'Actualizar'}</button></div>
    <div className="source-status-list">{sources.map(([source, label]) => <SourceStatusRow key={source} source={source} label={label} health={sourceHealth[source]} />)}</div>
    <p className="setting-note">Sismi combina las fuentes y elimina coincidencias. EMSC se usa para detección rápida.</p>
  </section>
}

function SourceStatusRow({ source, label, health }) {
  const isOk = health?.status === 'ok'
  const isError = health?.status === 'error'
  const statusText = isOk ? `${health.count} registros` : isError ? 'Sin respuesta' : 'Consultando…'
  return <div className="source-status-row"><span className={`source-status-dot ${isOk ? 'is-ok' : isError ? 'is-error' : 'is-pending'}`} /><div><strong>{source}</strong><small>{label}</small></div><span className={`source-status-copy ${isError ? 'is-error' : ''}`}>{statusText}</span></div>
}

function SafetyPanel() {
  const [guideTab, setGuideTab] = useState('during')
  const [contacts, setContacts] = useState(() => {
    const saved = readStoredValue('sismi-safety-contacts', null)
    return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_EMERGENCY_CONTACTS
  })
  const [addingContact, setAddingContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', number: '', note: '' })
  const [contactNotice, setContactNotice] = useState('')

  useEffect(() => { writeStoredValue('sismi-safety-contacts', contacts) }, [contacts])

  async function copyContact(contact) {
    try {
      await navigator.clipboard.writeText(contact.number)
      setContactNotice(`${contact.number} copiado.`)
    } catch {
      setContactNotice(`Número de ${contact.name}: ${contact.number}`)
    }
    window.setTimeout(() => setContactNotice(''), 2600)
  }

  function addContact(event) {
    event.preventDefault()
    const name = newContact.name.trim()
    const number = newContact.number.trim()
    if (!name || !number) {
      setContactNotice('Escribe un nombre y un número.')
      return
    }
    setContacts((current) => [...current, { id: `custom-${Date.now()}`, name, number, note: newContact.note.trim() || 'Contacto personal', isDefault: false }])
    setNewContact({ name: '', number: '', note: '' })
    setAddingContact(false)
    setContactNotice('Contacto guardado en este equipo.')
  }

  const steps = guideTab === 'during'
    ? [
      ['Agáchate, cúbrete y agárrate', 'Protege la cabeza y el cuello debajo de una mesa resistente o junto a un mueble firme.'],
      ['Aléjate de lo que pueda caer', 'Evita ventanas, espejos, estantes, lámparas y objetos pesados.'],
      ['Permanece en el lugar seguro', 'No uses ascensores ni corras hacia la salida mientras el suelo se mueve.'],
      ['Si estás afuera', 'Aléjate de fachadas, postes, árboles y cables. Busca un espacio abierto.'],
    ]
    : [
      ['Revisa si hay personas heridas', 'Ayuda solo si es seguro hacerlo y evita mover a alguien con lesiones graves.'],
      ['Aléjate de edificios dañados', 'Sal de forma ordenada y mantente lejos de ventanas, fachadas y cables.'],
      ['Prevén otros riesgos', 'Si es seguro y sabes hacerlo, cierra gas, agua o electricidad. No enciendas fuego si huele a gas.'],
      ['Prepárate para réplicas', 'Sigue a las autoridades y usa los contactos de emergencia si alguien necesita ayuda.'],
    ]

  return <div className="safety-content">
    <div className="safety-guide-tabs" role="tablist" aria-label="Guía de seguridad"><button className={guideTab === 'during' ? 'selected' : ''} onClick={() => setGuideTab('during')} role="tab" aria-selected={guideTab === 'during'}>Durante el sismo</button><button className={guideTab === 'after' ? 'selected' : ''} onClick={() => setGuideTab('after')} role="tab" aria-selected={guideTab === 'after'}>Después</button></div>
    <section className="safety-guide-section"><div className="safety-section-heading"><span>{guideTab === 'during' ? '01' : '02'}</span><div><strong>{guideTab === 'during' ? 'Mientras está temblando' : 'Cuando termine el movimiento'}</strong><small>Prioriza tu seguridad y la de quienes están contigo.</small></div></div><div className="safety-steps">{steps.map(([title, detail], index) => <div className="safety-step" key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{detail}</p></div></div>)}</div></section>
    <section className="safety-contacts-section"><div className="safety-section-heading"><span><Icon name="phone" size={15} /></span><div><strong>Contactos de emergencia</strong><small>Líneas frecuentes en Colombia y contactos guardados.</small></div></div><div className="safety-contact-list">{contacts.map((contact) => <div className="safety-contact" key={contact.id}><span className="safety-contact-icon"><Icon name="phone" size={14} /></span><div><strong>{contact.name}</strong><small>{contact.note}</small></div><a className="contact-call" href={`tel:${contact.number.replace(/[^0-9+#*]/g, '')}`} aria-label={`Llamar a ${contact.name}`}>{contact.number}</a><button className="contact-copy" onClick={() => copyContact(contact)}>Copiar</button>{!contact.isDefault && <button className="contact-remove" onClick={() => setContacts((current) => current.filter((item) => item.id !== contact.id))} aria-label={`Eliminar ${contact.name}`}>×</button>}</div>)}</div><button className="safety-add-contact" onClick={() => setAddingContact((current) => !current)}><Icon name={addingContact ? 'close' : 'plus'} size={14} />{addingContact ? 'Cancelar' : 'Agregar contacto'}</button>{addingContact && <form className="contact-form" onSubmit={addContact}><input value={newContact.name} onChange={(event) => setNewContact((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre" aria-label="Nombre del contacto" /><input value={newContact.number} onChange={(event) => setNewContact((current) => ({ ...current, number: event.target.value }))} placeholder="Número" aria-label="Número del contacto" inputMode="tel" /><input value={newContact.note} onChange={(event) => setNewContact((current) => ({ ...current, note: event.target.value }))} placeholder="Descripción opcional" aria-label="Descripción del contacto" /><button className="secondary-button" type="submit">Guardar contacto</button></form>}{contactNotice && <p className="contact-notice" role="status">{contactNotice}</p>}</section>
    <p className="safety-disclaimer">Sismi es una herramienta informativa. En una emergencia, comunícate con las autoridades y sigue sus indicaciones.</p>
  </div>
}

function AboutPanel({ updateState, checkForAppUpdate }) {
  return (
    <div className="about-content">
      <div className="about-hero">
        <div className="about-logo"><span /><img src="/sismi-logo.png" alt="Logo de Sismi" /></div>
        <div><span className="about-kicker">INFORMACIÓN SÍSMICA</span><h3>Sismi</h3><p>Avisos sísmicos claros para tu día</p><span className="about-version">Versión {APP_VERSION}</span></div>
      </div>
      <p className="about-intro">Consulta sismos recientes, revisa dónde ocurrieron y recibe avisos cuando coincidan con tus preferencias.</p>

      <div className="about-facts">
        <div className="about-fact"><span><Icon name="signal" size={16} /></span><div><small>Información</small><strong>SGC · USGS</strong></div></div>
        <div className="about-fact"><span><Icon name="bell" size={16} /></span><div><small>Avisos</small><strong>Sonido y Windows</strong></div></div>
        <div className="about-fact"><span><Icon name="globe" size={16} /></span><div><small>Visualización</small><strong>Mapa mundial</strong></div></div>
        <div className="about-fact"><span><Icon name="locate" size={16} /></span><div><small>Cobertura</small><strong>Local o mundial</strong></div></div>
      </div>

      <section className="about-block"><span className="about-kicker">PARA QUÉ SIRVE</span><p>Revisa el historial, consulta los sismos en el globo mundial y recibe avisos según la zona y la magnitud que elijas.</p></section>
      <section className="about-block about-note"><span className="about-kicker">NOTA IMPORTANTE</span><p>Los datos y avisos dependen de la disponibilidad y el tiempo de publicación de las fuentes oficiales. Sismi es una herramienta informativa y no reemplaza las instrucciones de las autoridades.</p></section>
      <section className="about-block about-update-block">
        <div className="about-update-heading"><div><span className="about-kicker">ACTUALIZACIONES</span><strong>{getUpdateTitle(updateState)}</strong></div><span className="about-update-version">v{APP_VERSION}</span></div>
        {updateState.status === 'available' && <p className="about-update-notes">Nueva versión disponible: v{updateState.version}{updateState.notes ? ` · ${updateState.notes}` : ''}</p>}
        {updateState.status === 'downloading' && <div className="about-update-progress"><span style={{ width: `${updateState.percent ?? 8}%` }} /></div>}
        <button className="secondary-button about-update-button" disabled={updateState.status === 'checking' || updateState.status === 'downloading'} onClick={() => checkForAppUpdate({ install: updateState.status === 'available' })}>
          <Icon name={updateState.status === 'available' ? 'refresh' : 'search'} size={15} />
          {getUpdateAction(updateState)}
        </button>
        <p className="test-alert-status">Sismi busca nuevas versiones automáticamente.</p>
      </section>
      <div className="about-footer"><img src="/sismi-logo.png" alt="" /><span>Avisos sísmicos claros, sin interrumpir tu trabajo.</span></div>
    </div>
  )
}

function UpdateBanner({ version, downloading, percent, onInstall, onDismiss }) {
  return <aside className="update-banner" role="status"><span className="update-banner-icon"><Icon name={downloading ? 'refresh' : 'download'} size={16} /></span><div><strong>{downloading ? 'Descargando actualización' : 'Nueva versión disponible'}</strong><p>{downloading ? `Descargando${percent !== null && percent !== undefined ? ` · ${percent}%` : '…'}` : `Sismi v${version} ya está lista para descargar.`}</p></div><button className="update-banner-action" onClick={onInstall} disabled={downloading}>{downloading ? `${percent ?? 0}%` : 'Descargar'}</button><button className="update-banner-close" onClick={onDismiss} aria-label="Recordármelo después"><Icon name="close" size={14} /></button></aside>
}

function getUpdateTitle(updateState) {
  const titles = {
    checking: 'Buscando una versión nueva…',
    downloading: 'Instalando actualización…',
    'up-to-date': 'Sismi está actualizado',
    available: 'Hay una actualización disponible',
    error: 'No se pudo comprobar ahora',
    unavailable: 'Actualizaciones no disponibles ahora',
    unsupported: 'Busca actualizaciones desde la app de Windows',
    idle: 'Sismi se mantiene al día',
  }
  return titles[updateState?.status] || titles.idle
}

function getUpdateAction(updateState) {
  if (updateState?.status === 'available') return `Instalar v${updateState.version}`
  if (updateState?.status === 'checking') return 'Buscando…'
  if (updateState?.status === 'downloading') return updateState.percent ? `Descargando ${updateState.percent}%` : 'Descargando…'
  return 'Buscar nuevas versiones'
}

function LocationSearch({ currentLocation, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setStatus(''); return undefined }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStatus('Buscando…')
      try {
        const places = await searchLocations(query, controller.signal)
        setResults(places)
        setOpen(true)
        setStatus(places.length ? '' : 'No encontramos esa ubicación.')
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('No fue posible buscar. Intenta de nuevo.')
      }
    }, 320)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  function choose(place) {
    onSelect(place)
    setQuery(place.label)
    setOpen(false)
  }

  return (
    <div className="location-picker">
      <label className="location-search-field"><Icon name="search" size={16} /><input role="combobox" aria-label="Buscar ciudad o municipio" aria-expanded={open && results.length > 0} aria-controls="location-results" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onFocus={() => results.length && setOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }} placeholder="Ciudad, municipio o código postal" />{query && <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} aria-label="Limpiar ubicación"><Icon name="close" size={14} /></button>}</label>
      {open && results.length > 0 && <div className="location-options" id="location-results" role="listbox">{results.map((place) => <button key={place.id} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}><span><Icon name="locate" size={15} /></span><div><strong>{place.name}</strong><small>{[place.region, place.country].filter(Boolean).join(', ')}</small></div><Icon name="chevron" size={14} /></button>)}</div>}
      {status && <p className="location-search-status" role="status">{status}</p>}
      <div className="selected-location"><span><Icon name="locate" size={16} /></span><div><strong>{currentLocation.label}</strong><small>{currentLocation.isCountry ? 'Cobertura nacional' : 'Ubicación seleccionada'}</small></div><Icon name="check" size={17} /></div>
      <p className="location-attribution">Búsqueda de lugares: Open-Meteo / GeoNames</p>
    </div>
  )
}

function EventRow({ event, detailed = false, distanceKm, onSelect }) {
  function handleKeyDown(keyEvent) { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); onSelect(event) } }
  return <div className={`event-row ${detailed ? 'detailed' : ''}`} role="button" tabIndex="0" onClick={() => onSelect(event)} onKeyDown={handleKeyDown}><div className={`event-marker ${event.tone}`}><strong>{event.magnitudeLabel}</strong></div><div className="row-copy"><strong>{event.place}</strong><span>{event.depth} · {event.source}{Number.isFinite(distanceKm) ? ` · ${distanceKm} km` : ''}</span></div><div className="row-time"><strong>{event.time}</strong><span>{event.magnitudeType}</span></div><Icon name="chevron" size={15} /></div>
}

function GlobalMapPanel({ events, totalEvents, location, source, setSource, minMagnitude, setMinMagnitude, timeRange, setTimeRange, query, setQuery, onlyNearby, setOnlyNearby, timelineEvents, timelineAt, setTimelineAt, timelineMin, timelineMax, onSelect }) {
  const [timelinePlaying, setTimelinePlaying] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const hasTimeline = timelineMax > timelineMin
  const timelineValue = timelineAt === null ? timelineMax : timelineAt

  useEffect(() => { setSelectedCluster(null) }, [events])

  useEffect(() => {
    if (!timelinePlaying || !hasTimeline) return undefined
    const step = Math.max(60 * 1000, Math.round((timelineMax - timelineMin) / 72))
    const interval = window.setInterval(() => {
      setTimelineAt((current) => {
        const currentValue = Number.isFinite(current) ? current : timelineMin
        const nextValue = Math.min(timelineMax, currentValue + step)
        if (nextValue >= timelineMax) window.setTimeout(() => setTimelinePlaying(false), 0)
        return nextValue
      })
    }, 160)
    return () => window.clearInterval(interval)
  }, [hasTimeline, setTimelineAt, timelineMax, timelineMin, timelinePlaying])

  function toggleTimeline() {
    if (!hasTimeline) return
    if (timelinePlaying) {
      setTimelinePlaying(false)
      return
    }
    if (timelineAt === null || timelineAt >= timelineMax) setTimelineAt(timelineMin)
    setTimelinePlaying(true)
  }

  function clearTimeline() {
    setTimelinePlaying(false)
    setTimelineAt(null)
  }

  return (
    <div className="map-panel">
      <div className="map-panel-heading"><div><span className="map-panel-icon"><Icon name="map" size={18} /></span><div><h2>Sismos en el mundo</h2><p>Consulta eventos por zona y fecha</p></div></div><span className="map-count">{events.length} / {totalEvents}</span></div>
      <div className="map-tools">
        <label className="map-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca un lugar o región" aria-label="Buscar en el mapa" />{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
        <div className="map-tool-row">
          <div className="map-source-filter" role="group" aria-label="Filtrar por fuente">
            {['all', 'USGS', 'SGC', 'EMSC'].map((value) => <button key={value} className={source === value ? 'selected' : ''} onClick={() => setSource(value)}>{value === 'all' ? 'Todas' : value}</button>)}
          </div>
          <select className="map-time-filter" value={timeRange} onChange={(event) => setTimeRange(event.target.value)} aria-label="Periodo visible"><option value="all">Todo lo disponible</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option></select>
        </div>
        <div className="map-control-row">
          <label className="map-range"><span>Magnitud mínima <strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="0" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <button className={`map-nearby-toggle ${onlyNearby ? 'selected' : ''}`} onClick={() => setOnlyNearby((current) => !current)} aria-pressed={onlyNearby}><Icon name="locate" size={14} />Mi zona</button>
        </div>
      </div>
      <div className="map-timeline">
        <div className="map-timeline-heading"><span><Icon name="activity" size={13} />Línea de tiempo</span><strong>{timelineAt === null ? 'Todos los eventos' : formatTimelineMoment(timelineAt)}</strong></div>
        <div className="map-timeline-controls"><button className="timeline-play" onClick={toggleTimeline} disabled={!hasTimeline} aria-label={timelinePlaying ? 'Pausar línea de tiempo' : 'Reproducir línea de tiempo'}><Icon name={timelinePlaying ? 'pause' : 'play'} size={12} /></button><input type="range" min={timelineMin || 0} max={timelineMax || 1} value={timelineValue || 0} disabled={!hasTimeline} onChange={(event) => { setTimelinePlaying(false); setTimelineAt(Number(event.target.value)) }} aria-label="Recorrer la línea de tiempo" /><button className="timeline-all" onClick={clearTimeline} disabled={timelineAt === null}>Todo</button></div>
        <div className="map-timeline-scale"><span>{timelineMin ? formatTimelineMoment(timelineMin) : 'Sin fecha'}</span><span>{timelineMax ? formatTimelineMoment(timelineMax) : 'Sin fecha'}</span></div>
      </div>
      <div className="map-status"><span><i />{events.length ? `${events.length} sismos visibles` : 'No hay sismos con estos filtros'}</span><small>{timelineAt === null ? 'Mueve el mapa · acerca la vista · toca un punto para ver sus datos' : `${timelineEvents.length} en el periodo · desliza para recorrerlos`}</small></div>
      <WorldEarthquakeMap events={events} location={location} onSelect={onSelect} onClusterSelect={setSelectedCluster} />
      {selectedCluster && <MapClusterList cluster={selectedCluster} onSelect={onSelect} onClose={() => setSelectedCluster(null)} />}
      <div className="map-legend" aria-label="Leyenda de magnitudes"><span><i className="legend-dot low" />1.0–2.9</span><span><i className="legend-dot medium" />3.0–4.4</span><span><i className="legend-dot high" />4.5+</span><small>Los grupos reúnen eventos cercanos · ciudades y países vienen de OpenStreetMap</small></div>
      <div className="map-summary"><div><span>Último sismo mostrado</span><strong>{events[0]?.place || 'Sin eventos con estos filtros'}</strong></div><div><span>Magnitud</span><strong>{events[0] ? `M ${events[0].magnitudeLabel}` : '—'}</strong></div><div><span>Fuente</span><strong>{events[0]?.source || '—'}</strong></div></div>
    </div>
  )
}

function MapClusterList({ cluster, onSelect, onClose }) {
  const clusterEvents = [...(cluster.clusterEvents || [])].sort((first, second) => second.timestamp - first.timestamp)
  return (
    <section className="map-cluster-list" aria-label={`${cluster.clusterSize} sismos agrupados`}>
      <div className="map-cluster-heading">
        <div><span className="map-cluster-icon"><Icon name="activity" size={15} /></span><div><strong>{cluster.clusterSize} sismos en esta zona</strong><span>Mayor magnitud M{cluster.magnitudeLabel} · toca uno para ver su información</span></div></div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar lista de sismos agrupados"><Icon name="close" size={15} /></button>
      </div>
      <div className="map-cluster-items">
        {clusterEvents.map((event) => <button className="map-cluster-item" key={getEventKey(event)} onClick={() => onSelect(event)}><span className={`event-marker ${event.tone}`}><strong>{event.magnitudeLabel}</strong></span><span className="map-cluster-copy"><strong>{event.place}</strong><small>{event.timeLabel} · {event.depth} · {event.source}</small></span><Icon name="chevron" size={14} /></button>)}
      </div>
    </section>
  )
}

function WorldEarthquakeMap({ events, location, onSelect, onClusterSelect }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const renderEventsRef = useRef(null)
  const updateLocationRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onClusterSelectRef = useRef(onClusterSelect)
  const locationRef = useRef(location)
  const [mapState, setMapState] = useState('loading')

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onClusterSelectRef.current = onClusterSelect }, [onClusterSelect])

  useEffect(() => {
    if (!mapContainer.current) return undefined

    let cancelled = false
    let map = null
    let primaryLayer = null
    let fallbackLayer = null
    let resizeObserver = null

    const initializeMap = () => {
      if (cancelled || map || !mapContainer.current || mapContainer.current._leaflet_id) return

      const initialCenter = location ? [location.lat, location.lon] : [20, 0]
      map = L.map(mapContainer.current, {
        attributionControl: false,
        zoomControl: false,
        scrollWheelZoom: true,
        worldCopyJump: true,
        preferCanvas: true,
        minZoom: 2,
        maxZoom: 18,
      }).setView(initialCenter, location ? 4 : 2)
      mapRef.current = map

      const eventsLayer = L.layerGroup().addTo(map)
      const locationLayer = L.layerGroup().addTo(map)
      let fallbackUsed = false

      const markReady = () => { if (!cancelled) setMapState('ready') }
      const useFallbackLayer = () => {
        if (fallbackUsed || cancelled || !map) return
        fallbackUsed = true
        fallbackLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors, Tiles style HOT',
        }).on('load', markReady).on('tileerror', () => !cancelled && setMapState('error')).addTo(map)
      }

      primaryLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).on('load', markReady).on('tileerror', useFallbackLayer).addTo(map)
      L.control.zoom({ position: 'topright' }).addTo(map)

      const createPointIcon = (point) => {
        const cluster = Boolean(point.isCluster)
        const magnitude = Number(point.magnitude) || 0
        const showMagnitude = !cluster && magnitude >= 4.5
        const label = cluster ? point.clusterSize : showMagnitude ? `M${point.magnitudeLabel}` : ''
        const size = cluster ? Math.min(34, 20 + Math.log2(point.clusterSize || 2) * 2.6) : showMagnitude ? 26 : 13
        return L.divIcon({
          className: 'world-map-point-icon',
          html: `<span class="world-map-point ${cluster ? 'is-cluster' : showMagnitude ? 'is-major' : 'is-event'}" style="--point-size:${size}px">${label}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })
      }

      const renderEvents = (nextEvents) => {
        eventsLayer.clearLayers()
        getMapPoints(nextEvents).forEach((point) => {
          const latitude = Number(point.latitude)
          const longitude = Number(point.longitude)
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
          const marker = L.marker([latitude, longitude], { icon: createPointIcon(point), keyboard: false })
          const tooltip = point.isCluster
            ? `${point.clusterSize} sismos en esta zona · mayor M${point.magnitudeLabel}`
            : `${point.place} · M${point.magnitudeLabel} · ${point.source}`
          marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -10], className: 'world-map-tooltip' })
          marker.on('click', () => {
            if (point.isCluster) {
              onClusterSelectRef.current?.(point)
              return
            }
            onSelectRef.current(point)
          })
          marker.addTo(eventsLayer)
        })
      }

      const renderLocation = (nextLocation) => {
        locationLayer.clearLayers()
        if (!nextLocation) return
        const latitude = Number(nextLocation.lat)
        const longitude = Number(nextLocation.lon)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
        L.circleMarker([latitude, longitude], { radius: 7, color: '#2f7255', weight: 2, fillColor: '#a6d4b5', fillOpacity: .95, interactive: false }).addTo(locationLayer)
        L.marker([latitude, longitude], { icon: L.divIcon({ className: 'world-map-location-icon', html: '<span>Mi ubicación</span>', iconSize: [90, 22], iconAnchor: [45, 31] }), interactive: false, keyboard: false }).addTo(locationLayer)
      }

      renderEvents(events)
      renderLocation(location)
      renderEventsRef.current = renderEvents
      updateLocationRef.current = renderLocation

      const invalidateSize = () => map?.invalidateSize({ animate: false })
      const resizeTimer = window.setTimeout(invalidateSize, 120)
      const secondResizeTimer = window.setTimeout(invalidateSize, 420)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(invalidateSize)
        resizeObserver.observe(mapContainer.current)
      }
      map.whenReady(invalidateSize)
      map._sismiResizeTimer = resizeTimer
      map._sismiSecondResizeTimer = secondResizeTimer
    }

    const frame = window.requestAnimationFrame(initializeMap)
    const delayedFrame = window.setTimeout(initializeMap, 180)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(delayedFrame)
      resizeObserver?.disconnect()
      if (map) {
        window.clearTimeout(map._sismiResizeTimer)
        window.clearTimeout(map._sismiSecondResizeTimer)
        map.remove()
      }
      primaryLayer = null
      fallbackLayer = null
      mapRef.current = null
      renderEventsRef.current = null
      updateLocationRef.current = null
    }
  }, [])

  useEffect(() => {
    renderEventsRef.current?.(events)
  }, [events])

  useEffect(() => {
    locationRef.current = location
    updateLocationRef.current?.(location)
  }, [location])

  function focusLocation() {
    const map = mapRef.current
    const currentLocation = locationRef.current
    if (!map || !currentLocation) return
    map.flyTo([currentLocation.lat, currentLocation.lon], Math.max(map.getZoom(), 6), { duration: .7 })
  }

  function resetMap() {
    const map = mapRef.current
    if (!map) return
    map.flyTo([20, 0], 2, { duration: .7 })
  }

  return <div className="world-map-shell"><div className="world-map" ref={mapContainer} aria-label="Mapa mundial interactivo" />{mapState === 'loading' && <div className="map-state"><Icon name="refresh" size={18} /><span>Cargando mapa…</span></div>}{mapState === 'error' && <div className="map-state is-error"><Icon name="map" size={18} /><span>No se pudo cargar el mapa. Revisa tu conexión.</span></div>}<div className="map-actions"><button onClick={focusLocation} disabled={!location} aria-label="Acercar a mi ubicación"><Icon name="locate" size={13} />Mi ubicación</button><button onClick={resetMap} aria-label="Restablecer vista mundial"><Icon name="globe" size={13} />Vista mundial</button></div><div className="map-credit">© OpenStreetMap contributors</div></div>
}

function EarthquakeMap({ event }) {
  const mapContainer = useRef(null)
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  const [mapState, setMapState] = useState(hasCoordinates ? 'loading' : 'unavailable')

  useEffect(() => {
    setMapState(hasCoordinates ? 'loading' : 'unavailable')
    if (!hasCoordinates || !mapContainer.current) return undefined

    let cancelled = false
    let map = null
    let resizeObserver = null
    let fallbackLayer = null

    const initializeMap = () => {
      if (cancelled || map || !mapContainer.current || mapContainer.current._leaflet_id) return

      const center = [latitude, longitude]
      map = L.map(mapContainer.current, {
        attributionControl: false,
        scrollWheelZoom: false,
        zoomControl: false,
        minZoom: 2,
        maxZoom: 18,
      }).setView(center, 7)

      let fallbackUsed = false
      const primaryLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      })
      const useFallbackLayer = () => {
        if (fallbackUsed || cancelled || !map) return
        fallbackUsed = true
        fallbackLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors, Tiles style HOT',
        }).on('load', () => !cancelled && setMapState('ready')).on('tileerror', () => !cancelled && setMapState('error'))
        fallbackLayer.addTo(map)
      }
      primaryLayer.on('load', () => !cancelled && setMapState('ready')).on('tileerror', useFallbackLayer).addTo(map)

      L.control.zoom({ position: 'topright' }).addTo(map)

      const markerIcon = L.divIcon({
        className: 'earthquake-marker',
        html: '<span><i></i></span>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })

      const magnitude = Number(event.magnitude) || 1
      L.circle(center, {
        radius: Math.max(9000, magnitude * 11000),
        color: '#4f9674',
        weight: 1.5,
        opacity: 0.75,
        fillColor: '#8fc5a5',
        fillOpacity: 0.18,
        interactive: false,
      }).addTo(map)
      L.marker(center, { icon: markerIcon, keyboard: false }).addTo(map)

      const invalidateSize = () => map?.invalidateSize({ animate: false })
      const resizeTimer = window.setTimeout(invalidateSize, 120)
      const secondResizeTimer = window.setTimeout(invalidateSize, 420)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(invalidateSize)
        resizeObserver.observe(mapContainer.current)
      }

      map.whenReady(invalidateSize)
      map._sismiResizeTimer = resizeTimer
      map._sismiSecondResizeTimer = secondResizeTimer
    }

    const frame = window.requestAnimationFrame(initializeMap)
    const delayedFrame = window.setTimeout(initializeMap, 180)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(delayedFrame)
      resizeObserver?.disconnect()
      if (map) {
        window.clearTimeout(map._sismiResizeTimer)
        window.clearTimeout(map._sismiSecondResizeTimer)
        if (fallbackLayer && map.hasLayer(fallbackLayer)) map.removeLayer(fallbackLayer)
        map.remove()
      }
    }
  }, [event.id, event.magnitude, hasCoordinates, latitude, longitude])

  if (!hasCoordinates) {
    return <div className="map-unavailable"><Icon name="map" size={22} /><strong>No hay mapa para este sismo</strong><span>La fuente no proporcionó una ubicación válida.</span></div>
  }

  return (
    <section className="event-map-section" aria-label="Mapa del epicentro">
      <div className="map-heading"><div><Icon name="map" size={16} /><strong>Epicentro del sismo</strong></div><span>{latitude.toFixed(3)}, {longitude.toFixed(3)}</span></div>
      <div className="event-map" ref={mapContainer}>
        {mapState === 'loading' && <div className="map-state"><Icon name="refresh" size={18} /><span>Cargando mapa…</span></div>}
        {mapState === 'error' && <div className="map-state is-error"><Icon name="map" size={18} /><span>No se pudo cargar el mapa. Revisa tu conexión.</span></div>}
      </div>
      <div className="map-credit">© OpenStreetMap contributors</div>
    </section>
  )
}

function EventDetails({ event, distanceKm, onClose }) {
  const metadata = event.metadata || {}
  const items = [['Identificador', metadata.eventId || event.id], ['Fuente y red', `${metadata.agency || event.source} · ${event.source}`], ['Red sísmica', metadata.networkCode || '—'], ['Estado', metadata.status || '—'], ['Hora del evento', metadata.localTime || event.timeLabel], ['Aviso recibido', event.detectedAt ? `${formatClock(event.detectedAt)}${formatDetectionLag(event)}` : '—'], ['Hora UTC', metadata.utcTime || '—'], ['Última actualización', metadata.updated || '—'], ['Coordenadas', `${formatValue(event.latitude)}, ${formatValue(event.longitude)}`], ['Distancia', Number.isFinite(distanceKm) ? `${distanceKm} km` : '—'], ['Magnitud', `${event.magnitudeLabel} ${event.magnitudeType}`], ['Profundidad', event.depth], ['Personas que lo sintieron', metadata.felt ?? '—'], ['Intensidad reportada (CDI / MMI)', `${metadata.cdi ?? '—'} / ${metadata.mmi ?? '—'}`], ['Nivel de alerta', metadata.alert || '—'], ['Estaciones de medición', metadata.nst ?? '—'], ['RMS', metadata.rms ?? '—'], ['Separación de estaciones', metadata.gap ? `${metadata.gap}°` : '—'], ['Distancia mínima a estación', metadata.dmin ?? '—'], ['Importancia del evento', metadata.significance ?? '—'], ['Tsunami', metadata.tsunami === null || metadata.tsunami === undefined ? '—' : metadata.tsunami ? 'Sí' : 'No'], ['Poblaciones cercanas', metadata.closestTowns || '—'], ['Código del evento', metadata.eventCode || '—'], ['Tipo de evento', metadata.eventTypes || '—']]
  return <div className="details-overlay" role="presentation" onClick={onClose}><section className="details-sheet" role="dialog" aria-modal="true" aria-label="Información completa del sismo" onClick={(eventClick) => eventClick.stopPropagation()}><header className="details-header"><div><p>Información del sismo</p><h2>{event.place}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar detalles"><Icon name="close" size={17} /></button></header><div className="details-hero"><strong>{event.magnitudeLabel}</strong><div><span>{event.magnitudeType} · {event.source}</span><small>{event.timeLabel}</small></div></div><EarthquakeMap event={event} /><div className="details-grid">{items.map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><strong>{formatValue(value)}</strong></div>)}</div><p className="source-note">Información tomada de fuentes oficiales y mostrada dentro de Sismi.</p></section></div>
}

function mergeEarthquakeEvents(events) {
  const merged = []
  for (const event of events) {
    const duplicateIndex = merged.findIndex((existing) => isEquivalentEarthquake(existing, event))
    if (duplicateIndex === -1) {
      merged.push(event)
      continue
    }
    merged[duplicateIndex] = preferredEarthquake(merged[duplicateIndex], event)
  }
  return merged.sort((a, b) => b.timestamp - a.timestamp)
}

function isKnownEarthquake(event, knownEvents) {
  return knownEvents.some((knownEvent) => isEquivalentEarthquake(knownEvent, event))
}

function isEquivalentEarthquake(first, second) {
  if (!first || !second) return false
  if (first.source === second.source && first.id && second.id) return first.id === second.id
  if (first.source === second.source) return false
  if (!Number.isFinite(first.timestamp) || !Number.isFinite(second.timestamp)) return false
  if (Math.abs(first.timestamp - second.timestamp) > 5 * 60 * 1000) return false
  if (![first.latitude, first.longitude, second.latitude, second.longitude].every(Number.isFinite)) return false
  if (distanceBetween({ lat: first.latitude, lon: first.longitude }, second) > 60) return false
  return Math.abs(Number(first.magnitude) - Number(second.magnitude)) <= 0.8
}

function preferredEarthquake(first, second) {
  if (first.source === second.source) return second
  const priority = { SGC: 3, USGS: 2, EMSC: 1 }
  return (priority[second.source] || 0) > (priority[first.source] || 0) ? second : first
}

function isNearby(event, center) { const distanceKm = distanceBetween(center, event); return Number.isFinite(distanceKm) && distanceKm <= center.radiusKm }
function isQuietHoursNow(start, end) {
  const toMinutes = (value) => {
    const [hours, minutes] = String(value).split(':').map(Number)
    return (hours * 60) + minutes
  }
  const current = new Date()
  const currentMinutes = (current.getHours() * 60) + current.getMinutes()
  const startMinutes = toMinutes(start)
  const endMinutes = toMinutes(end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes === endMinutes) return false
  return startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes
}
function formatClock(timestamp) { return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp) }
function formatSyncTime(timestamp) { return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp) }
function formatTimelineMoment(timestamp) { return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp) }
function formatDetectionLag(event) {
  if (!Number.isFinite(event?.detectedAt) || !Number.isFinite(event?.timestamp)) return ''
  const minutes = Math.max(0, Math.round((event.detectedAt - event.timestamp) / 60000))
  return ` · demora ${minutes < 1 ? 'menor a 1 min' : `${minutes} min`}`
}
function formatValue(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'boolean') return value ? 'Sí' : 'No'; return String(value) }
function readStoredValue(key, fallback) { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback } catch { return fallback } }
function writeStoredValue(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* almacenamiento opcional */ } }
function readAlertRules() {
  const saved = readStoredValue('sismi-alert-rules', {})
  const legacy = {
    minMagnitude: readStoredValue('sismi-min-magnitude', DEFAULT_ALERT_RULE.minMagnitude),
    source: readStoredValue('sismi-alert-source', DEFAULT_ALERT_RULE.source),
    quietHoursEnabled: readStoredValue('sismi-quiet-hours-enabled', DEFAULT_ALERT_RULE.quietHoursEnabled),
    quietHoursStart: readStoredValue('sismi-quiet-hours-start', DEFAULT_ALERT_RULE.quietHoursStart),
    quietHoursEnd: readStoredValue('sismi-quiet-hours-end', DEFAULT_ALERT_RULE.quietHoursEnd),
    sound: readStoredValue('sismi-alert-sound', DEFAULT_ALERT_RULE.sound),
    maxAlertsPerUpdate: readStoredValue('sismi-max-alerts', DEFAULT_ALERT_RULE.maxAlertsPerUpdate),
  }
  const normalize = (value) => {
    const rule = { ...DEFAULT_ALERT_RULE, ...legacy, ...(value && typeof value === 'object' ? value : {}) }
    const magnitude = Number(rule.minMagnitude)
    const maxAlerts = Number(rule.maxAlertsPerUpdate)
    return {
      minMagnitude: Number.isFinite(magnitude) ? Math.min(7, Math.max(1, magnitude)) : DEFAULT_ALERT_RULE.minMagnitude,
      source: ALERT_SOURCE_OPTIONS.includes(rule.source) ? rule.source : DEFAULT_ALERT_RULE.source,
      quietHoursEnabled: Boolean(rule.quietHoursEnabled),
      quietHoursStart: /^\d{2}:\d{2}$/.test(String(rule.quietHoursStart)) ? String(rule.quietHoursStart) : DEFAULT_ALERT_RULE.quietHoursStart,
      quietHoursEnd: /^\d{2}:\d{2}$/.test(String(rule.quietHoursEnd)) ? String(rule.quietHoursEnd) : DEFAULT_ALERT_RULE.quietHoursEnd,
      sound: ALERT_SOUND_OPTIONS.includes(rule.sound) ? rule.sound : DEFAULT_ALERT_RULE.sound,
      maxAlertsPerUpdate: [1, 3, 5, 10].includes(maxAlerts) ? maxAlerts : DEFAULT_ALERT_RULE.maxAlertsPerUpdate,
    }
  }
  return { nearby: normalize(saved?.nearby), global: normalize(saved?.global) }
}
async function notifyEvent(event, soundProfile = 'intense') { if (!event) return; await notifyDesktop({ title: `Sismi · Magnitud ${event.magnitudeLabel}`, body: `${event.place} · ${event.depth} · ${event.source}${event.detectedAt ? ` · Recibido ${formatClock(event.detectedAt)}` : ''}`, tag: `sismi-alert-${event.id}`, sound: soundProfile !== 'silent' }) }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
