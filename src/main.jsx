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

function getGlobeLabels(location) {
  const monitor = location ? { ...location, type: 'monitor' } : null
  return [monitor, ...CITY_LABELS].filter(Boolean)
}

function getWaveEvents(events) {
  return events.slice(0, 48)
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
  const [locationStatus, setLocationStatus] = useState('Busca una ciudad o usa la ubicación del dispositivo.')
  const [minMagnitude, setMinMagnitude] = useState(() => readStoredValue('sismi-min-magnitude', 3))
  const [alertScope, setAlertScope] = useState(() => readStoredValue('sismi-alert-scope', 'nearby') === 'global' ? 'global' : 'nearby')
  const [historyQuery, setHistoryQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [activeAlert, setActiveAlert] = useState(null)
  const [testNotificationStatus, setTestNotificationStatus] = useState('')
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
  const loaderStartedAt = useRef(Date.now())
  const loaderFinished = useRef(false)

  const last24Hours = Date.now() - 24 * 60 * 60 * 1000
  const nearbyEvents = useMemo(() => events.filter((event) => event.timestamp >= last24Hours && isNearby(event, location)), [events, location, last24Hours])
  const scopedRecentEvents = useMemo(() => alertScope === 'global' ? events : events.filter((event) => isNearby(event, location)), [alertScope, events, location])
  const latestNearby = nearbyEvents[0]
  const latest = latestNearby || events[0]
  const nearbyCount = countNearby(events, location)
  const latestDistance = distanceBetween(location, latest)
  const filteredEvents = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    if (!query) return events
    return events.filter((event) => [event.place, event.source, event.id, event.metadata?.title, event.metadata?.agency].filter(Boolean).join(' ').toLowerCase().includes(query))
  }, [events, historyQuery])
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
  const statusLabel = feedError ? 'Sin conexión' : notifications ? 'Monitoreando' : 'Alertas pausadas'
  const monitoringLabel = alertScope === 'global' ? 'Todo el mundo' : location.label

  useEffect(() => { notificationsRef.current = notifications; writeStoredValue('sismi-alerts', notifications) }, [notifications])
  useEffect(() => { locationRef.current = location; writeStoredValue('sismi-location', location) }, [location])
  useEffect(() => { writeStoredValue('sismi-location-mode', locationMode) }, [locationMode])
  useEffect(() => { minMagnitudeRef.current = minMagnitude; writeStoredValue('sismi-min-magnitude', minMagnitude) }, [minMagnitude])
  useEffect(() => { alertScopeRef.current = alertScope; writeStoredValue('sismi-alert-scope', alertScope) }, [alertScope])
  useEffect(() => { document.documentElement.dataset.theme = theme; writeStoredValue('sismi-theme', theme) }, [theme])
  useEffect(() => {
    if (isDesktopApp()) document.documentElement.classList.add('native-window')
    return () => document.documentElement.classList.remove('native-window')
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
      if (freshEvents.length > 0) setEvents(eventsWithDetection)
      setSourceStatus([...new Set(freshEvents.map((event) => event.source))].join(' + '))
      freshEvents.forEach((event) => knownEventIds.current.add(getEventKey(event)))
      hasLoadedFeed.current = true
      lastSuccessfulFeedAt.current = Date.now()
      if (notificationsRef.current && newlyDetectedEvents.length > 0) announceAlerts(newlyDetectedEvents, locationRef.current, minMagnitudeRef.current, alertScopeRef.current)
      setFeedError(null)
      setLastChecked('ahora')
    } catch (error) {
      if (error.name !== 'AbortError') { setFeedError('No se pudieron actualizar las fuentes'); setLastChecked('sin actualizar') }
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
      setLocationStatus('Permite las notificaciones del sistema para recibir alertas.')
      return
    }
    setNotifications((current) => !current)
  }

  async function testNotification() {
    setTestNotificationStatus('Solicitando permiso…')
    const permissionGranted = await requestNotificationPermission()
    if (!permissionGranted) {
      setTestNotificationStatus('Permiso no concedido. Revisa las notificaciones de Windows.')
      return
    }
    const testTime = Date.now()
    const testAlert = { id: 'test-alert', place: 'Simulación de Sismi', magnitudeLabel: '4.8', magnitudeType: 'ML', depth: '12 km', source: 'PRUEBA', tone: 'amber', timeLabel: 'Ahora', timestamp: testTime, detectedAt: testTime, isTest: true }
    setActiveAlert(testAlert)
    await playAlertSound()
    await notifyEvent(testAlert)
    setTestNotificationStatus('Alerta enviada correctamente.')
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
    setLocation({ label: place.label, lat: place.latitude, lon: place.longitude, radiusKm: location.radiusKm })
    setLocationMode('search')
    setLocationStatus(`Monitoreando desde ${place.label}.`)
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) { setLocationStatus('Este dispositivo no permite obtener la ubicación automáticamente.'); return }
    setLocationStatus('Solicitando permiso de ubicación…')
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = Number(position.coords.latitude.toFixed(5))
      const lon = Number(position.coords.longitude.toFixed(5))
      setLocation({ label: 'Ubicación actual', lat, lon, radiusKm: location.radiusKm })
      setLocationMode('auto')
      setLocationStatus('Ubicación actual guardada en este dispositivo.')
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED ? 'Permiso denegado. Puedes buscar tu ciudad.' : 'No fue posible obtener tu ubicación.')
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
        {activeAlert && <EarthquakeAlert event={activeAlert} onClose={() => setActiveAlert(null)} />}

        <nav className="tabs" aria-label="Secciones">
          <button className={activeTab === 'live' ? 'active' : ''} onClick={() => setActiveTab('live')}>Ahora</button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>Historial <span>{events.length}</span></button>
          <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}><Icon name="globe" size={14} />Mapa</button>
        </nav>

        {!selectedEvent && (activeTab === 'live' ? (
          <div className="content-stack">
            <article className="latest-card">
              <div className="card-topline"><span className="live-label"><span />{latestNearby ? 'Dentro de tu radio' : 'Último evento registrado'}</span><time>{latest.timeLabel || latest.time}</time></div>
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
              <div className="event-list">{scopedRecentEvents.length > 0 ? scopedRecentEvents.slice(0, 3).map((event) => <EventRow key={event.id} event={event} distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="activity-empty"><Icon name="locate" size={18} /><span>No hay sismos recientes dentro de tu radio.</span></div>}</div>
            </section>

            <div className="location-summary"><span className="location-icon"><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><span>Radio de monitoreo: {location.radiusKm} km</span></div><button onClick={() => { setAboutOpen(false); setSettingsOpen(true) }}>Cambiar</button></div>
          </div>
        ) : activeTab === 'history' ? (
          <div className="history-panel">
            <div className="history-intro"><div><p>Registros disponibles</p><h2>Historial sísmico</h2></div><span>{filteredEvents.length}</span></div>
            <label className="search-field"><Icon name="search" size={16} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Buscar lugar, fuente o ID" aria-label="Buscar en el historial" />{historyQuery && <button onClick={() => setHistoryQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
            <div className="history-results">{filteredEvents.length > 0 ? filteredEvents.map((event) => <EventRow key={event.id} event={event} detailed distanceKm={distanceBetween(location, event)} onSelect={setSelectedEvent} />) : <div className="empty-state"><Icon name="search" size={21} /><strong>Sin resultados</strong><span>Prueba con otro lugar, fuente o identificador.</span></div>}</div>
          </div>
        ) : (
          <GlobalMapPanel events={filteredMapEvents} totalEvents={events.length} location={location} source={mapSource} setSource={setMapSource} minMagnitude={mapMinMagnitude} setMinMagnitude={setMapMinMagnitude} timeRange={mapTimeRange} setTimeRange={setMapTimeRange} query={mapQuery} setQuery={setMapQuery} onlyNearby={mapOnlyNearby} setOnlyNearby={setMapOnlyNearby} onSelect={setSelectedEvent} />
        ))}

        {settingsOpen && <SettingsDrawer {...{ location, locationMode, setLocationMode, locationStatus, minMagnitude, setMinMagnitude, alertScope, setAlertScope, notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, aboutOpen, setAboutOpen, close: () => setSettingsOpen(false) }} />}
        {selectedEvent && <EventDetails event={selectedEvent} distanceKm={distanceBetween(location, selectedEvent)} onClose={() => setSelectedEvent(null)} />}

        <footer className="panel-footer"><span><Icon name="signal" size={14} /> {sourceStatus || 'Fuentes'} conectados</span><span>v0.1.1</span></footer>
      </section>
    </main>
  )
}

function AppLoader() {
  return <div className="app-loader" role="status" aria-live="polite"><div className="loader-logo-wrap"><span className="loader-ring" /><img src="/sismi-logo.png" alt="" /></div><strong>Iniciando Sismi</strong><span>Conectando con SGC y USGS</span><div className="loader-progress"><i /></div></div>
}

function EarthquakeAlert({ event, onClose }) {
  return <div className="earthquake-alert" role="alert"><span className="earthquake-alert-icon"><Icon name="bell" size={18} /></span><div><small>{event.isTest ? 'PRUEBA DE ALERTA' : 'ALERTA DE SISMO'}</small><strong>Magnitud {event.magnitudeLabel} · {event.place}</strong><p>{event.depth} · {event.source}{event.detectedAt ? ` · Detectado ${formatClock(event.detectedAt)}` : ''}</p></div><button onClick={onClose} aria-label="Cerrar alerta"><Icon name="close" size={15} /></button></div>
}

function SettingsDrawer({ location, locationMode, setLocationMode, locationStatus, minMagnitude, setMinMagnitude, alertScope, setAlertScope, notifications, toggleNotifications, testNotification, testNotificationStatus, theme, toggleTheme, updateRadius, selectSearchedLocation, requestCurrentLocation, aboutOpen, setAboutOpen, close }) {
  return (
    <aside className="settings-drawer" aria-label="Configuración de Sismi">
      <header className="drawer-heading"><div><button className="back-button" onClick={aboutOpen ? () => setAboutOpen(false) : close} aria-label={aboutOpen ? 'Volver a configuración' : 'Volver'}><Icon name="back" size={17} /></button><div><h2>{aboutOpen ? 'Acerca de Sismi' : 'Configuración'}</h2><p>{aboutOpen ? 'Información de la aplicación' : 'Preferencias del monitor'}</p></div></div><button className="icon-button" onClick={close} aria-label="Cerrar configuración"><Icon name="close" size={16} /></button></header>
      {aboutOpen ? <AboutPanel /> : <div className="settings-content">
        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="locate" size={16} /></span><div><strong>Ubicación</strong><span>Centro del radio de monitoreo</span></div></div>
          <div className="segmented"><button className={locationMode === 'search' ? 'selected' : ''} onClick={() => setLocationMode('search')}>Buscar lugar</button><button className={locationMode === 'auto' ? 'selected' : ''} onClick={requestCurrentLocation}>Ubicación actual</button></div>
          {locationMode === 'search' ? <LocationSearch currentLocation={location} onSelect={selectSearchedLocation} /> : <div className="selected-location"><span><Icon name="locate" size={16} /></span><div><strong>{location.label}</strong><small>Ubicación obtenida del dispositivo</small></div><Icon name="check" size={17} /></div>}
          <label className="range-field"><span><span>Radio de monitoreo</span><strong>{location.radiusKm} km</strong></span><input type="range" min="25" max="1000" step="25" value={location.radiusKm} onChange={(event) => updateRadius(event.target.value)} /></label>
          <p className="setting-note">{locationStatus}</p>
        </section>

        <section className="settings-section">
          <div className="section-heading"><span className="section-icon"><Icon name="activity" size={16} /></span><div><strong>Alertas</strong><span>Sensibilidad y notificaciones</span></div></div>
          <div className="alert-scope-label"><span>Cobertura de las alertas</span><strong>{alertScope === 'global' ? 'Todo el mundo' : 'Mi zona'}</strong></div>
          <div className="alert-scope-picker" role="group" aria-label="Cobertura de las alertas">
            <button className={alertScope === 'nearby' ? 'selected' : ''} onClick={() => setAlertScope('nearby')} aria-pressed={alertScope === 'nearby'}><span><Icon name="locate" size={17} /></span><div><strong>Mi zona</strong><small>Dentro de {location.radiusKm} km de {location.label}</small></div>{alertScope === 'nearby' && <Icon name="check" size={17} />}</button>
            <button className={alertScope === 'global' ? 'selected' : ''} onClick={() => setAlertScope('global')} aria-pressed={alertScope === 'global'}><span><Icon name="globe" size={17} /></span><div><strong>Todo el mundo</strong><small>Cualquier país, según la magnitud mínima</small></div>{alertScope === 'global' && <Icon name="check" size={17} />}</button>
          </div>
          <label className="range-field"><span><span>Magnitud mínima</span><strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="1" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <div className="setting-row"><div><strong>Alertas de escritorio</strong><span>Sonido y notificación del sistema</span></div><button className={`toggle ${notifications ? 'on' : ''}`} onClick={toggleNotifications} aria-label="Activar o desactivar alertas"><span /></button></div>
          <button className="secondary-button" onClick={testNotification}><Icon name="bell" size={15} /> Probar alerta de sismo</button>
          <p className="test-alert-status" role="status">{testNotificationStatus || 'Comprueba sonido, aviso visual y notificación.'}</p>
        </section>

        <section className="settings-section appearance-section">
          <div className="section-heading"><span className="section-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></span><div><strong>Apariencia</strong><span>{theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}</span></div></div>
          <button className="theme-choice" onClick={toggleTheme}><span>{theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}</span><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        </section>
        <section className="settings-section about-entry-section">
          <button className="about-entry" onClick={() => setAboutOpen(true)}><span className="about-entry-icon"><Icon name="info" size={17} /></span><span><strong>Acerca de Sismi</strong><small>Versión, fuentes y propósito de la app</small></span><Icon name="chevron" size={16} /></button>
        </section>
      </div>}
    </aside>
  )
}

function AboutPanel() {
  return (
    <div className="about-content">
      <div className="about-hero">
        <div className="about-logo"><span /><img src="/sismi-logo.png" alt="Logo de Sismi" /></div>
        <div><span className="about-kicker">MONITOREO SÍSMICO</span><h3>Sismi</h3><p>Información clara para estar preparado</p><span className="about-version">Versión 0.1.1</span></div>
      </div>
      <p className="about-intro">Sismi reúne información sísmica reciente en un panel pequeño, claro y siempre disponible desde la bandeja del sistema.</p>

      <div className="about-facts">
        <div className="about-fact"><span><Icon name="signal" size={16} /></span><div><small>Fuentes conectadas</small><strong>SGC · USGS</strong></div></div>
        <div className="about-fact"><span><Icon name="bell" size={16} /></span><div><small>Alertas</small><strong>Sonido y Windows</strong></div></div>
        <div className="about-fact"><span><Icon name="globe" size={16} /></span><div><small>Visualización</small><strong>Mapa mundial</strong></div></div>
        <div className="about-fact"><span><Icon name="locate" size={16} /></span><div><small>Cobertura</small><strong>Local o mundial</strong></div></div>
      </div>

      <section className="about-block"><span className="about-kicker">QUÉ HACE SISMI</span><p>Consulta el historial de sismos, muestra los eventos sobre un globo interactivo y avisa cuando aparece un evento que coincide con tu magnitud y cobertura configuradas.</p></section>
      <section className="about-block about-note"><span className="about-kicker">NOTA IMPORTANTE</span><p>Los datos y avisos dependen de la disponibilidad y el tiempo de publicación de las fuentes oficiales. Sismi es una herramienta informativa y no reemplaza las instrucciones de las autoridades.</p></section>
      <div className="about-footer"><img src="/sismi-logo.png" alt="" /><span>Actividad sísmica cerca de ti, cuando más importa.</span></div>
    </div>
  )
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
      <div className="selected-location"><span><Icon name="locate" size={16} /></span><div><strong>{currentLocation.label}</strong><small>Ubicación seleccionada</small></div><Icon name="check" size={17} /></div>
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
      <div className="map-panel-heading"><div><span className="map-panel-icon"><Icon name="globe" size={18} /></span><div><h2>Mapa mundial</h2><p>Explora la distribución de los sismos</p></div></div><span className="map-count">{events.length} / {totalEvents}</span></div>
      <div className="map-tools">
        <label className="map-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lugar o región" aria-label="Buscar en el mapa" />{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><Icon name="close" size={14} /></button>}</label>
        <div className="map-tool-row">
          <div className="map-source-filter" role="group" aria-label="Filtrar por fuente">
            {['all', 'USGS', 'SGC'].map((value) => <button key={value} className={source === value ? 'selected' : ''} onClick={() => setSource(value)}>{value === 'all' ? 'Todas' : value}</button>)}
          </div>
          <select className="map-time-filter" value={timeRange} onChange={(event) => setTimeRange(event.target.value)} aria-label="Periodo del mapa"><option value="all">Todo lo disponible</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option></select>
        </div>
        <div className="map-control-row">
          <label className="map-range"><span>Magnitud mínima <strong>{Number(minMagnitude).toFixed(1)}</strong></span><input type="range" min="0" max="7" step="0.5" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} /></label>
          <button className={`map-nearby-toggle ${onlyNearby ? 'selected' : ''}`} onClick={() => setOnlyNearby((current) => !current)} aria-pressed={onlyNearby}><Icon name="locate" size={14} />Mi zona</button>
        </div>
      </div>
      <div className="map-status"><span><i />{events.length ? 'Marcadores visibles' : 'No hay sismos con estos filtros'}</span><small>Arrastra para mover · rueda para zoom · toca un marcador para ver detalles</small></div>
      <WorldEarthquakeGlobe events={events} location={location} onSelect={onSelect} />
      <div className="globe-legend" aria-label="Leyenda de magnitudes"><span><i className="legend-dot low" />1.0–2.9</span><span><i className="legend-dot medium" />3.0–4.4</span><span><i className="legend-dot high" />4.5+</span><small>Color = magnitud · líneas = países · etiquetas = ciudades</small></div>
      <div className="globe-summary"><div><span>Último evento visible</span><strong>{events[0]?.place || 'Sin eventos con estos filtros'}</strong></div><div><span>Magnitud</span><strong>{events[0] ? `M ${events[0].magnitudeLabel}` : '—'}</strong></div><div><span>Fuente</span><strong>{events[0]?.source || '—'}</strong></div></div>
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
      .atmosphereColor('#d77b3b')
      .atmosphereAltitude(0.07)
      .pointLat('latitude')
      .pointLng('longitude')
      .pointColor((event) => Number(event.magnitude) >= 4.5 ? '#e9bc88' : '#d48258')
      .pointRadius((event) => Math.max(0.045, Math.min(0.13, 0.045 + (Number(event.magnitude) || 0) * 0.012)))
      .pointAltitude(0.003)
      .pointResolution(12)
      .pointsMerge(false)
      .pointLabel((event) => `${event.place} · M${event.magnitudeLabel} · ${event.source}`)
      .ringsData(getWaveEvents(events))
      .ringLat('latitude')
      .ringLng('longitude')
      .ringAltitude(0.008)
      .ringColor((event) => Number(event.magnitude) >= 4.5 ? ['rgba(255, 210, 145, 0.78)', 'rgba(255, 210, 145, 0)'] : ['rgba(244, 160, 93, 0.54)', 'rgba(244, 160, 93, 0)'])
      .ringMaxRadius((event) => Math.min(2.1, 0.55 + (Number(event.magnitude) || 0) * 0.14))
      .ringPropagationSpeed(0.65)
      .ringRepeatPeriod(1850)
      .polygonsData(COUNTRY_POLYGONS)
      .polygonLabel((country) => country.properties?.name || 'País')
      .polygonCapColor(() => 'rgba(255, 177, 103, 0.018)')
      .polygonSideColor(() => 'rgba(255, 177, 103, 0.035)')
      .polygonStrokeColor(() => 'rgba(255, 190, 125, 0.26)')
      .polygonAltitude(0.002)
      .polygonsTransitionDuration(0)
      .labelsData(getGlobeLabels(location))
      .labelLat('lat')
      .labelLng('lon')
      .labelText((place) => place.label)
      .labelColor((place) => place.type === 'monitor' ? '#f5bd7a' : 'rgba(255, 255, 255, 0.68)')
      .labelSize((place) => place.type === 'monitor' ? 0.5 : 0.3)
      .labelDotRadius((place) => place.type === 'monitor' ? 0.18 : 0.08)
      .labelAltitude((place) => place.type === 'monitor' ? 0.025 : 0.014)
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
    }
  }, [events])

  useEffect(() => {
    if (globeRef.current) globeRef.current.labelsData(getGlobeLabels(location))
  }, [location])

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

  useEffect(() => {
    if (!hasCoordinates || !mapContainer.current) return undefined

    const center = [latitude, longitude]
    const map = L.map(mapContainer.current, {
      attributionControl: false,
      scrollWheelZoom: false,
      zoomControl: false,
      minZoom: 2,
      maxZoom: 18,
    }).setView(center, 7)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

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

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
    }
  }, [event.id, event.magnitude, hasCoordinates, latitude, longitude])

  if (!hasCoordinates) {
    return <div className="map-unavailable"><Icon name="map" size={22} /><strong>Mapa no disponible</strong><span>La fuente no entregó coordenadas válidas para este evento.</span></div>
  }

  return (
    <section className="event-map-section" aria-label="Mapa del epicentro">
      <div className="map-heading"><div><Icon name="map" size={16} /><strong>Ubicación del epicentro</strong></div><span>{latitude.toFixed(3)}, {longitude.toFixed(3)}</span></div>
      <div className="event-map" ref={mapContainer} />
      <div className="map-credit">© OpenStreetMap contributors</div>
    </section>
  )
}

function EventDetails({ event, distanceKm, onClose }) {
  const metadata = event.metadata || {}
  const items = [['ID del evento', metadata.eventId || event.id], ['Fuente / red', `${metadata.agency || event.source} · ${event.source}`], ['Código de red', metadata.networkCode || '—'], ['Estado', metadata.status || '—'], ['Hora del sismo', metadata.localTime || event.timeLabel], ['Detectado por Sismi', event.detectedAt ? `${formatClock(event.detectedAt)}${formatDetectionLag(event)}` : '—'], ['Hora UTC', metadata.utcTime || '—'], ['Actualizado', metadata.updated || '—'], ['Coordenadas', `${formatValue(event.latitude)}, ${formatValue(event.longitude)}`], ['Distancia', Number.isFinite(distanceKm) ? `${distanceKm} km` : '—'], ['Magnitud', `${event.magnitudeLabel} ${event.magnitudeType}`], ['Profundidad', event.depth], ['Reportes sentidos', metadata.felt ?? '—'], ['Intensidad CDI / MMI', `${metadata.cdi ?? '—'} / ${metadata.mmi ?? '—'}`], ['Nivel de alerta', metadata.alert || '—'], ['Estaciones', metadata.nst ?? '—'], ['RMS', metadata.rms ?? '—'], ['Gap', metadata.gap ? `${metadata.gap}°` : '—'], ['Distancia mínima', metadata.dmin ?? '—'], ['Significancia', metadata.significance ?? '—'], ['Tsunami', metadata.tsunami === null || metadata.tsunami === undefined ? '—' : metadata.tsunami ? 'Sí' : 'No'], ['Poblaciones cercanas', metadata.closestTowns || '—'], ['Código del evento', metadata.eventCode || '—'], ['Tipos de evento', metadata.eventTypes || '—']]
  return <div className="details-overlay" role="presentation" onClick={onClose}><section className="details-sheet" role="dialog" aria-modal="true" aria-label="Información completa del sismo" onClick={(eventClick) => eventClick.stopPropagation()}><header className="details-header"><div><p>Información del evento</p><h2>{event.place}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar detalles"><Icon name="close" size={17} /></button></header><div className="details-hero"><strong>{event.magnitudeLabel}</strong><div><span>{event.magnitudeType} · {event.source}</span><small>{event.timeLabel}</small></div></div><EarthquakeMap event={event} /><div className="details-grid">{items.map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><strong>{formatValue(value)}</strong></div>)}</div><p className="source-note">Datos mostrados dentro de Sismi desde las fuentes oficiales disponibles.</p></section></div>
}

function isNearby(event, center) { const distanceKm = distanceBetween(center, event); return Number.isFinite(distanceKm) && distanceKm <= center.radiusKm }
function formatClock(timestamp) { return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(timestamp) }
function formatDetectionLag(event) {
  if (!Number.isFinite(event?.detectedAt) || !Number.isFinite(event?.timestamp)) return ''
  const minutes = Math.max(0, Math.round((event.detectedAt - event.timestamp) / 60000))
  return ` · retraso ${minutes < 1 ? 'menor a 1 min' : `${minutes} min`}`
}
function formatValue(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'boolean') return value ? 'Sí' : 'No'; return String(value) }
function readStoredValue(key, fallback) { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback } catch { return fallback } }
function writeStoredValue(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* almacenamiento opcional */ } }
async function notifyEvent(event) { if (!event) return; await notifyDesktop({ title: `Sismi · Magnitud ${event.magnitudeLabel}`, body: `${event.place} · ${event.depth} · ${event.source}${event.detectedAt ? ` · Detectado ${formatClock(event.detectedAt)}` : ''}`, tag: `sismi-alert-${event.id}` }) }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
