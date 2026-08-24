import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Globe from 'globe.gl'
import L from 'leaflet'
import { feature } from 'topojson-client'
import countriesTopology from 'world-atlas/countries-110m.json'
import 'leaflet/dist/leaflet.css'
import { BOGOTA, countNearby, distanceBetween, fetchEarthquakes } from './services/earthquakes'
import { searchLocations } from './services/locations'
import { closeWindow as closeDesktopWindow, isDesktopApp, minimizeWindow as minimizeDesktopWindow, notifyDesktop, playAlertSound, requestNotificationPermission } from './services/desktop'
import { APP_VERSION, checkForSismiUpdate } from './services/updater'
import './styles.css'

const DEFAULT_LOCATION = { label: 'Bogotá, Colombia', lat: BOGOTA.lat, lon: BOGOTA.lon, radiusKm: 250 }
const COUNTRY_POLYGONS = feature(countriesTopology, countriesTopology.objects.countries).features
const CITY_LABELS = [
  { label: 'Bogotá', lat: 4.711, lon: -74.0721, type: 'city' },
  { label: 'Medellín', lat: 6.2442, lon: -75.5812, type: 'city' },
  { label: 'Cali', lat: 3.4516, lon: -76.532, type: 'city' },
  { label: 'Barranquilla', lat: 10.9685, lon: -74.7813, type: 'city' },
  { label: 'Quito', lat: -0.1807, lon: -78.4678, type: 'city' },
  { label: 'Lima', lat: -12.0464, lon: -77.0428, type: 'city' },
  { label: 'Ciudad de México', lat: 19.4326, lon: -99.1332, type: 'city' },
  { label: 'Nueva York', lat: 40.7128, lon: -74.006, type: 'city' },
  { label: 'Los Ángeles', lat: 34.0522, lon: -118.2437, type: 'city' },
  { label: 'São Paulo', lat: -23.5505, lon: -46.6333, type: 'city' },
  { label: 'Buenos Aires', lat: -34.6037, lon: -58.3816, type: 'city' },
  { label: 'Londres', lat: 51.5074, lon: -0.1278, type: 'city' },
  { label: 'Madrid', lat: 40.4168, lon: -3.7038, type: 'city' },
  { label: 'París', lat: 48.8566, lon: 2.3522, type: 'city' },
  { label: 'El Cairo', lat: 30.0444, lon: 31.2357, type: 'city' },
  { label: 'Ciudad del Cabo', lat: -33.9249, lon: 18.4241, type: 'city' },
  { label: 'Estambul', lat: 41.0082, lon: 28.9784, type: 'city' },
  { label: 'Nueva Delhi', lat: 28.6139, lon: 77.209, type: 'city' },
  { label: 'Tokio', lat: 35.6762, lon: 139.6503, type: 'city' },
  { label: 'Seúl', lat: 37.5665, lon: 126.978, type: 'city' },
  { label: 'Manila', lat: 14.5995, lon: 120.9842, type: 'city' },
  { label: 'Sídney', lat: -33.8688, lon: 151.2093, type: 'city' },
  { label: 'Auckland', lat: -36.8509, lon: 174.7645, type: 'city' },
]

function getGlobeLabels(location, events = []) {
  const monitor = location ? { ...location, type: 'monitor' } : null
  const magnitudeLabels = events.filter((event) => Number(event.magnitude) >= 3).map((event) => ({
    label: event.magnitudeLabel,
    lat: Number(event.latitude),
    lon: Number(event.longitude),
    type: 'event',
    magnitude: Number(event.magnitude) || 0,
  })).filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon))
  return [monitor, ...CITY_LABELS, ...magnitudeLabels].filter(Boolean)
}

function getWaveEvents(events) {
  return events.filter((event) => Number(event.magnitude) >= 3).slice(0, 24)
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

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
  const paths = {
    activity: <path d="M3 12h4l2.2-7 4.1 14L16 12h5" />,
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
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.9-3L3 11" /><path d="M3 5v6h6" /><path d="M4 13a8.1 8.1 0 0 0 14.9 3L21 13" /><path d="M21 19v-6h-6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    signal: <><path d="M5 20v-3" /><path d="M9.5 20v-6" /><path d="M14.5 20v-9" /><path d="M19 20V7" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function App() {
  const [activeTab, setActiveTab] = useState('live')
  const [booting, setBooting] = useState(true)
  const [notifications, setNotifications] = useState(() => readStoredValue('sismi-alerts', true))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastChecked, setLastChecked] = useState('iniciando…')
  const [events, setEvents] = useState(initialEvents)
  const [feedError, setFeedError] = useState(null)
  const [sourceStatus, setSourceStatus] = useState('SGC + USGS')
  const [theme, setTheme] = useState(() => readStoredValue('sismi-theme', 'light'))
  const [location, setLocation] = useState(() => readStoredValue('sismi-location', DEFAULT_LOCATION))
  const [locationMode, setLocationMode] = useState(() => readStoredValue('sismi-location-mode', 'search') === 'auto' ? 'auto' : 'search')
  const [locationStatus, setLocationStatus] = useState('Elige una ciudad o usa la ubicación de este equipo.')
  const [minMagnitude, setMinMagnitude] = useState(() => readStoredValue('sismi-min-magnitude', 3))
  const [alertScope, setAlertScope] = useState(() => readStoredValue('sismi-alert-scope', 'nearby') === 'global' ? 'global' : 'nearby')
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
  const notificationsRef = useRef(notifications)
  const locationRef = useRef(location)
  const minMagnitudeRef = useRef(minMagnitude)
  const alertScopeRef = useRef(alertScope)
  const knownEventIds = useRef(new Set(initialEvents.map((event) => getEventKey(event))))
  const detectedAtByKey = useRef(new Map())
  const hasLoadedFeed = useRef(false)
  const lastSuccessfulFeedAt = useRef(0)
  const feedRequestInFlight = useRef(false)
  const previousLocationKey = useRef(null)
  const updateRequestInFlight = useRef(false)
  const updateNoticeShown = useRef(false)
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
  const filteredMapEvents = useMemo(() => {
    const query = mapQuery.trim().toLowerCase()
    const now = Date.now()
    const rangeMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 }[mapTimeRange]
    return events.filter((event) => {
      if (mapSource !== 'all' && event.source !== mapSource) return false
      if (Number(event.magnitude) < mapMinMagnitude) return false
      if (rangeMs && event.timestamp < now - rangeMs) return false
      if (mapOnlyNearby && !isNearby(event, location)) return false
      if (query && ![event.place, event.source, event.metadata?.title, event.metadata?.agency].filter(Boolean).join(' ').toLowerCase().includes(query)) return false
      return Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))
    })
  }, [events, location, mapMinMagnitude, mapOnlyNearby, mapQuery, mapSource, mapTimeRange])
  const statusLabel = feedError ? 'Sin conexión' : notifications ? 'Vigilancia activa' : 'Avisos pausados'
  const monitoringLabel = alertScope === 'global' ? 'Todo el mundo' : location.label

  useEffect(() => { notificationsRef.current = notifications; writeStoredValue('sismi-alerts', notifications) }, [notifications])
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
  useEffect(() => { minMagnitudeRef.current = minMagnitude; writeStoredValue('sismi-min-magnitude', minMagnitude) }, [minMagnitude])
  useEffect(() => { alertScopeRef.current = alertScope; writeStoredValue('sismi-alert-scope', alertScope) }, [alertScope])
  useEffect(() => { document.documentElement.dataset.theme = theme; writeStoredValue('sismi-theme', theme) }, [theme])
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

  async function loadFeed(signal) {
    if (feedRequestInFlight.current) return
    feedRequestInFlight.current = true
    setRefreshing(true)
    try {
      const freshEvents = await fetchEarthquakes(signal)
      const detectedAt = Date.now()
      const alertCutoff = lastSuccessfulFeedAt.current - 15 * 60 * 1000
      const newEvents = hasLoadedFeed.current
        ? freshEvents.filter((event) => !knownEventIds.current.has(getEventKey(event)) && event.timestamp >= alertCutoff)
        : []
      newEvents.forEach((event) => detectedAtByKey.current.set(getEventKey(event), detectedAt))
      const eventsWithDetection = freshEvents.map((event) => ({ ...event, detectedAt: detectedAtByKey.current.get(getEventKey(event)) }))
      const newlyDetectedEvents = newEvents.map((event) => ({ ...event, detectedAt: detectedAtByKey.current.get(getEventKey(event)) }))
      setEvents(eventsWithDetection)
      setSourceStatus([...new Set(freshEvents.map((event) => event.source))].join(' + '))
      freshEvents.forEach((event) => knownEventIds.current.add(getEventKey(event)))
      hasLoadedFeed.current = true
      lastSuccessfulFeedAt.current = Date.now()
      if (notificationsRef.current && newlyDetectedEvents.length > 0) announceAlerts(newlyDetectedEvents, locationRef.current, minMagnitudeRef.current, alertScopeRef.current)
      setFeedError(null)
      setLastChecked(formatClock(detectedAt))
    } catch (error) {
      if (error.name !== 'AbortError') { setFeedError('No pudimos traer información nueva'); setLastChecked('sin actualizar') }
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

  async function toggleNotifications() {
    if (!notifications && !(await requestNotificationPermission())) {
      setLocationStatus('Activa los avisos de Windows para recibir alertas.')
      return
    }
    setNotifications((current) => !current)
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
    await playAlertSound()
    await notifyEvent(testAlert)
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

  async function announceAlerts(candidateEvents, center, threshold, scope) {
    const eligibleEvents = candidateEvents.filter((event) => (
      event.magnitude >= threshold
      && (scope === 'global' || isNearby(event, center))
    ))
    if (eligibleEvents.length === 0) return

    setActiveAlert(eligibleEvents[0])
    await playAlertSound()
    await Promise.all(eligibleEvents.map((event) => notifyEvent(event)))
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
            <button className="icon-button" title="Configuración" aria-label="Configuración" onClick={() => { setAboutOpen(false); setSettingsOpen(true) }}><Icon name="settings" size={17} /></button>
            <button className="icon-button" title="Ocultar" aria-label="Ocultar en la bandeja" onClick={minimizeDesktopWindow}><Icon name="minus" size={17} /></button>
            <button className="icon-button close-button" title="Cerrar" aria-label="Ocultar en la bandeja" onClick={closeDesktopWindow}><Icon name="close" size={16} /></button>
          </div>
        </header>

        <div className="monitor-bar">
          <div className="monitor-state"><span className={`status-dot ${feedError || !notifications ? 'is-paused' : 'is-live'}`} /><strong>{statusLabel}</strong><span>· {monitoringLabel}</span></div>
          <button className={`refresh-button ${refreshing ? 'is-refreshing' : ''}`} onClick={() => loadFeed()} aria-label="Actualizar datos"><Icon name="refresh" size={14} /><span>{lastChecked}</span></button>
        </div>

        {feedError && <div className="feed-alert" role="status">{feedError}. Mostrando los últimos registros.</div>}
        {(updateState.status === 'available' || updateState.status === 'downloading') && !updateNoticeDismissed && <UpdateBanner version={updateState.version} downloading={updateState.status === 'downloading'} percent={updateState.percent} onInstall={() => checkForAppUpdate({ install: true })} onDismiss={() => setUpdateNoticeDismissed(true)} />}
        {activeAlert && <EarthquakeAlert event={activeAlert} onClose={() => setActiveAlert(null)} />}

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
              <div className="quick-stat"><span>{alertScope === 'global' ? 'Cobertura de alertas' : 'Radio activo'}</span><strong>{alertScope === 'global' ? 'Mundial' : `${location.radiusKm} km`}</strong><small>{alertScope === 'global' ? `Magnitud mínima ${Number(minMagnitude).toFixed(1)}` : location.label}</small></div>
            </div>

            <section className="recent-section">
              <div className="section-title"><div className="section-heading-copy"><h3>Actividad reciente</h3><span className="section-context">{alertScope === 'global' ? 'Todo el mundo' : 'Mi zona'}</span></div><button onClick={() => setActiveTab('history')}>Ver todo <Icon name="chevron" size={14} /></button></div>
              <div className="event-list">{scopedRecentEvents.length > 0 ? scopedRecentEvents.slice(0, 3).map((event) => <EventRow key={event.id} event={event} distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="activity-empty"><Icon name={alertScope === 'global' ? 'globe' : 'locate'} size={18} /><span>{alertScope === 'global' ? 'No hay sismos registrados en las últimas 24 horas.' : 'No hay sismos recientes dentro de tu zona.'}</span></div>}</div>
            </section>

            <div className="location-summary"><span className="location-icon"><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><span>{location.isCountry ? 'Cobertura nacional' : `Distancia de aviso: ${location.radiusKm} km`}</span></div><button onClick={() => { setAboutOpen(false); setSettingsOpen(true) }}>Cambiar</button></div>
          </div>
        ) : activeTab === 'history' ? (
          <div className="history-panel">
            <div className="history-intro"><div><p>Registros de {alertScope === 'global' ? 'todo el mundo' : 'mi zona'}</p><h2>Historial sísmico</h2></div><span>{filteredEvents.length}</span></div>
            <div className="history-scope-row"><span>Mostrar</span><div className="history-scope-toggle"><button className={alertScope === 'nearby' ? 'selected' : ''} onClick={() => setAlertScope('nearby')}><Icon name="locate" size={13} />Mi zona</button><button className={alertScope === 'global' ? 'selected' : ''} onClick={() => setAlertScope('global')}><Icon name="globe" size={13} />Todo el mundo</button></div></div>
            <label className="search-field"><Icon name="search" size={16} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Busca por lugar o fuente" aria-label="Buscar en el historial" />{historyQuery && <button onClick={() => setHistoryQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
            <div className="history-results">{filteredEvents.length > 0 ? filteredEvents.map((event) => <EventRow key={event.id} event={event} detailed distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="empty-state"><Icon name="search" size={21} /><strong>No encontramos sismos</strong><span>Intenta buscar otro lugar o fuente.</span></div>}</div>
          </div>
        ) : (
          <GlobalMapPanel events={filteredMapEvents} totalEvents={events.length} location={location} source={mapSource} setSource={setMapSource} minMagnitude={mapMinMagnitude} setMinMagnitude={setMapMinMagnitude} timeRange={mapTimeRange} setTimeRange={setMapTimeRange} query={mapQuery} setQuery={setMapQuery} onlyNearby={mapOnlyNearby} setOnlyNearby={setMapOnlyNearby} onSelect={setSelectedEvent} />
        ))}

        {settingsOpen && <SettingsDrawer {...{ location, locationMode, setLocationMode, locationStatus, minMagnitude, setMinMagnitude, alertScope, setAlertScope, notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, aboutOpen, setAboutOpen, updateState, checkForAppUpdate, close: () => setSettingsOpen(false) }} />}
        {selectedEvent && <EventDetails event={selectedEvent} distanceKm={distanceBetween(location, selectedEvent)} onClose={() => setSelectedEvent(null)} />}

        <footer className="panel-footer"><span><Icon name="signal" size={14} /> {sourceStatus || 'Fuentes'} activas</span><span>v{APP_VERSION}</span></footer>
      </section>
    </main>
  )
}

function AppLoader() {
  return <div className="app-loader" role="status" aria-live="polite"><div className="loader-logo-wrap"><span className="loader-ring" /><img src="/sismi-logo.png" alt="" /></div><strong>Cargando Sismi</strong><span>Consultando información sísmica</span><div className="loader-progress"><i /></div></div>
}

function EarthquakeAlert({ event, onClose }) {
  return <div className="earthquake-alert" role="alert"><span className="earthquake-alert-icon"><Icon name="bell" size={18} /></span><div><small>{event.isTest ? 'AVISO DE PRUEBA' : 'ALERTA DE SISMO'}</small><strong>Magnitud {event.magnitudeLabel} · {event.place}</strong><p>{event.depth} · {event.source}{event.detectedAt ? ` · Recibido ${formatClock(event.detectedAt)}` : ''}</p></div><button onClick={onClose} aria-label="Cerrar alerta"><Icon name="close" size={15} /></button></div>
}

function SettingsDrawer({ location, locationMode, setLocationMode, locationStatus, minMagnitude, setMinMagnitude, alertScope, setAlertScope, notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, aboutOpen, setAboutOpen, updateState, checkForAppUpdate, close }) {
  return (
    <aside className="settings-drawer" aria-label="Configuración de Sismi">
      <header className="drawer-heading"><div><button className="back-button" onClick={aboutOpen ? () => setAboutOpen(false) : close} aria-label={aboutOpen ? 'Volver a configuración' : 'Volver'}><Icon name="back" size={17} /></button><div><h2>{aboutOpen ? 'Acerca de Sismi' : 'Configuración'}</h2><p>{aboutOpen ? 'Información de Sismi' : 'Preferencias de avisos'}</p></div></div><button className="icon-button" onClick={close} aria-label="Cerrar configuración"><Icon name="close" size={16} /></button></header>
      {aboutOpen ? <AboutPanel updateState={updateState} checkForAppUpdate={checkForAppUpdate} /> : <div className="settings-content">
        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="locate" size={16} /></span><div><strong>Ubicación</strong><span>Lugar desde el que recibirás avisos</span></div></div>
          <div className="segmented"><button className={locationMode === 'search' ? 'selected' : ''} onClick={() => setLocationMode('search')}>Elegir ciudad</button><button className={locationMode === 'auto' ? 'selected' : ''} onClick={requestCurrentLocation}>Usar mi ubicación</button></div>
          {locationMode === 'search' ? <LocationSearch currentLocation={location} onSelect={selectSearchedLocation} /> : <div className="selected-location"><span><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><small>Ubicación de este equipo</small></div><Icon name="check" size={17} /></div>}
          <label className="range-field"><span><span>Distancia de aviso</span><strong>{location.radiusKm} km</strong></span><input type="range" min="25" max="1000" step="25" value={location.radiusKm} onChange={(event) => updateRadius(event.target.value)} /></label>
          <p className="setting-note">{locationStatus}</p>
        </section>

        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="activity" size={16} /></span><div><strong>Alertas</strong><span>Elige qué sismos quieres recibir</span></div></div>
          <div className="alert-scope-label"><span>Dónde recibir avisos</span><strong>{alertScope === 'global' ? 'Todo el mundo' : 'Mi zona'}</strong></div>
          <div className="alert-scope-picker" role="group" aria-label="Dónde recibir avisos">
            <button className={alertScope === 'nearby' ? 'selected' : ''} onClick={() => setAlertScope('nearby')} aria-pressed={alertScope === 'nearby'}><span><Icon name="locate" size={17} /></span><div><strong>Mi zona</strong><small>{location.isCountry ? `En todo ${location.label}` : `Dentro de ${location.radiusKm} km de ${location.label}`}</small></div>{alertScope === 'nearby' && <Icon name="check" size={17} />}</button>
            <button className={alertScope === 'global' ? 'selected' : ''} onClick={() => setAlertScope('global')} aria-pressed={alertScope === 'global'}><span><Icon name="globe" size={17} /></span><div><strong>Todo el mundo</strong><small>Recibe avisos de cualquier país</small></div>{alertScope === 'global' && <Icon name="check" size={17} />}</button>
          </div>
          <label className="range-field"><span><span>Magnitud mínima</span><strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="1" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <div className="setting-row"><div><strong>Avisos en el escritorio</strong><span>Sonido y aviso de Windows</span></div><button className={`toggle ${notifications ? 'on' : ''}`} onClick={toggleNotifications} aria-label="Activar o desactivar avisos"><span /></button></div>
          <button className="secondary-button" onClick={testNotification}><Icon name="bell" size={15} /> Probar aviso</button>
          <p className="test-alert-status" role="status">{testNotificationStatus || 'Haz una prueba para confirmar que todo funciona.'}</p>
        </section>

        <section className="settings-section appearance-section">
          <div className="section-heading"><span className="section-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></span><div><strong>Apariencia</strong><span>{theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}</span></div></div>
          <button className="theme-choice" onClick={toggleTheme}><span>{theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}</span><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        </section>
        <section className="settings-section about-entry-section">
          <button className="about-entry" onClick={() => setAboutOpen(true)}><span className="about-entry-icon"><Icon name="info" size={17} /></span><span><strong>Acerca de Sismi</strong><small>Conoce Sismi y sus funciones</small></span><Icon name="chevron" size={16} /></button>
        </section>
      </div>}
    </aside>
  )
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

function GlobalMapPanel({ events, totalEvents, location, source, setSource, minMagnitude, setMinMagnitude, timeRange, setTimeRange, query, setQuery, onlyNearby, setOnlyNearby, onSelect }) {
  return (
    <div className="map-panel">
      <div className="map-panel-heading"><div><span className="map-panel-icon"><Icon name="globe" size={18} /></span><div><h2>Sismos en el mundo</h2><p>Consulta eventos por zona y fecha</p></div></div><span className="map-count">{events.length} / {totalEvents}</span></div>
      <div className="map-tools">
        <label className="map-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca un lugar o región" aria-label="Buscar en el mapa" />{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
        <div className="map-tool-row">
          <div className="map-source-filter" role="group" aria-label="Filtrar por fuente">
            {['all', 'USGS', 'SGC'].map((value) => <button key={value} className={source === value ? 'selected' : ''} onClick={() => setSource(value)}>{value === 'all' ? 'Todas' : value}</button>)}
          </div>
          <select className="map-time-filter" value={timeRange} onChange={(event) => setTimeRange(event.target.value)} aria-label="Periodo visible"><option value="all">Todo lo disponible</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option></select>
        </div>
        <div className="map-control-row">
          <label className="map-range"><span>Magnitud mínima <strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="0" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <button className={`map-nearby-toggle ${onlyNearby ? 'selected' : ''}`} onClick={() => setOnlyNearby((current) => !current)} aria-pressed={onlyNearby}><Icon name="locate" size={14} />Mi zona</button>
        </div>
      </div>
      <div className="map-status"><span><i />{events.length ? 'Sismos mostrados' : 'No hay sismos con estos filtros'}</span><small>Mueve el mapa · acerca la vista · toca un punto para ver sus datos</small></div>
      <WorldEarthquakeGlobe events={events} location={location} onSelect={onSelect} />
      <div className="globe-legend" aria-label="Leyenda de magnitudes"><span><i className="legend-dot low" />1.0–2.9</span><span><i className="legend-dot medium" />3.0–4.4</span><span><i className="legend-dot high" />4.5+</span><small>Color = magnitud · números = M3+ · etiquetas = ciudades</small></div>
      <div className="globe-summary"><div><span>Último sismo mostrado</span><strong>{events[0]?.place || 'Sin eventos con estos filtros'}</strong></div><div><span>Magnitud</span><strong>{events[0] ? `M ${events[0].magnitudeLabel}` : '—'}</strong></div><div><span>Fuente</span><strong>{events[0]?.source || '—'}</strong></div></div>
    </div>
  )
}

function WorldEarthquakeGlobe({ events, location, onSelect }) {
  const globeContainer = useRef(null)
  const globeRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const locationRef = useRef(location)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { locationRef.current = location }, [location])

  useEffect(() => {
    if (!globeContainer.current) return undefined

    const globe = Globe()(globeContainer.current)
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor('#79b58f')
      .atmosphereAltitude(0.07)
      .pointLat('latitude')
      .pointLng('longitude')
      .pointColor((event) => Number(event.magnitude) >= 4.5 ? '#d6eadb' : Number(event.magnitude) >= 3 ? '#a9cfb5' : '#83b69a')
      .pointRadius((event) => Math.max(0.012, Math.min(0.026, 0.010 + (Number(event.magnitude) || 0) * 0.003)))
      .pointAltitude(0.002)
      .pointResolution(8)
      .pointsMerge(false)
      .pointLabel((event) => `${event.place} · M${event.magnitudeLabel} · ${event.source}`)
      .ringsData(getWaveEvents(events))
      .ringLat('latitude')
      .ringLng('longitude')
      .ringAltitude(0.005)
      .ringColor((event) => Number(event.magnitude) >= 4.5 ? ['rgba(214, 234, 219, 0.42)', 'rgba(214, 234, 219, 0)'] : ['rgba(131, 182, 154, 0.28)', 'rgba(131, 182, 154, 0)'])
      .ringMaxRadius((event) => Math.min(0.82, 0.28 + (Number(event.magnitude) || 0) * 0.06))
      .ringPropagationSpeed(0.34)
      .ringRepeatPeriod(2600)
      .polygonsData(COUNTRY_POLYGONS)
      .polygonLabel((country) => country.properties?.name || 'País')
      .polygonCapColor(() => 'rgba(126, 181, 145, 0.018)')
      .polygonSideColor(() => 'rgba(126, 181, 145, 0.035)')
      .polygonStrokeColor(() => 'rgba(176, 216, 188, 0.28)')
      .polygonAltitude(0.002)
      .polygonsTransitionDuration(0)
      .labelsData(getGlobeLabels(location, events))
      .labelLat('lat')
      .labelLng('lon')
      .labelText((place) => place.label)
      .labelColor((place) => place.type === 'event' ? (place.magnitude >= 4.5 ? '#d6eadb' : '#83b69a') : place.type === 'monitor' ? '#b9dfc4' : 'rgba(222, 239, 226, 0.68)')
      .labelSize((place) => place.type === 'event' ? 0.07 : place.type === 'monitor' ? 0.14 : 0.09)
      .labelDotRadius((place) => place.type === 'event' ? 0 : place.type === 'monitor' ? 0.08 : 0.04)
      .labelAltitude((place) => place.type === 'event' ? 0.008 : place.type === 'monitor' ? 0.025 : 0.014)
      .labelResolution(2)
      .onPointClick((event) => onSelectRef.current(event))

    globe.width(globeContainer.current.clientWidth).height(globeContainer.current.clientHeight)
    const controls = globe.controls()
    controls.enableRotate = true
    controls.enableZoom = true
    controls.enablePan = false
    controls.autoRotate = false
    controls.minDistance = 102
    controls.maxDistance = 450
    globe.pointOfView({ lat: location?.lat || 0, lng: location?.lon || 0, altitude: 2.6 }, 0)
    globe.globeMaterial().transparent = true
    globe.globeMaterial().opacity = 0.92
    globeRef.current = globe

    return () => {
      globe.pauseAnimation()
      globe.renderer().dispose()
      if (globeContainer.current) globeContainer.current.replaceChildren()
      globeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointsData(events)
      globeRef.current.ringsData(getWaveEvents(events))
      globeRef.current.labelsData(getGlobeLabels(locationRef.current, events))
    }
  }, [events])

  useEffect(() => {
    if (globeRef.current) globeRef.current.labelsData(getGlobeLabels(location, events))
  }, [events, location])

  function focusLocation() {
    const globe = globeRef.current
    const currentLocation = locationRef.current
    if (!globe || !currentLocation) return
    globe.pointOfView({ lat: currentLocation.lat, lng: currentLocation.lon, altitude: 0.07 }, 900)
  }

  function resetGlobe() {
    const globe = globeRef.current
    const currentLocation = locationRef.current
    if (!globe) return
    globe.pointOfView({ lat: currentLocation?.lat || 0, lng: currentLocation?.lon || 0, altitude: 2.6 }, 700)
  }

  return <div className="world-globe-shell"><div className="world-globe" ref={globeContainer} aria-label="Globo terráqueo interactivo" /><div className="globe-actions"><button onClick={focusLocation} disabled={!location} aria-label="Acercar a mi ubicación"><Icon name="locate" size={13} />Mi ubicación</button><button onClick={resetGlobe} aria-label="Restablecer vista mundial"><Icon name="globe" size={13} />Vista mundial</button></div></div>
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

function isNearby(event, center) { const distanceKm = distanceBetween(center, event); return Number.isFinite(distanceKm) && distanceKm <= center.radiusKm }
function formatClock(timestamp) { return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp) }
function formatDetectionLag(event) {
  if (!Number.isFinite(event?.detectedAt) || !Number.isFinite(event?.timestamp)) return ''
  const minutes = Math.max(0, Math.round((event.detectedAt - event.timestamp) / 60000))
  return ` · demora ${minutes < 1 ? 'menor a 1 min' : `${minutes} min`}`
}
function formatValue(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'boolean') return value ? 'Sí' : 'No'; return String(value) }
function readStoredValue(key, fallback) { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback } catch { return fallback } }
function writeStoredValue(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* almacenamiento opcional */ } }
async function notifyEvent(event) { if (!event) return; await notifyDesktop({ title: `Sismi · Magnitud ${event.magnitudeLabel}`, body: `${event.place} · ${event.depth} · ${event.source}${event.detectedAt ? ` · Recibido ${formatClock(event.detectedAt)}` : ''}`, tag: `sismi-alert-${event.id}` }) }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
