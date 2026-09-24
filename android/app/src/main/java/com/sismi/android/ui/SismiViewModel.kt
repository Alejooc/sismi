package com.sismi.android.ui

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.sismi.android.data.Earthquake
import com.sismi.android.data.EarthquakeRepository
import com.sismi.android.data.EventScope
import com.sismi.android.data.FeedStatus
import com.sismi.android.data.LocationRepository
import com.sismi.android.data.RefreshResult
import com.sismi.android.data.SavedLocation
import com.sismi.android.data.SismiSettings
import com.sismi.android.data.SismiStore
import com.sismi.android.data.distanceKm
import com.sismi.android.notifications.SismiNotifications
import com.sismi.android.notifications.RemoteAlertsClient
import com.sismi.android.widget.SismiWidget
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import okhttp3.WebSocket
import java.time.LocalTime

data class SismiUiState(
    val events: List<Earthquake> = emptyList(),
    val sources: List<FeedStatus> = listOf(FeedStatus("SGC"), FeedStatus("USGS"), FeedStatus("EMSC")),
    val settings: SismiSettings = SismiSettings(),
    val refreshing: Boolean = false,
    val lastSyncAt: Long? = null,
    val connectionMessage: String? = null,
    val locationResults: List<SavedLocation> = emptyList(),
    val searchingLocations: Boolean = false,
    val locationError: String? = null,
    val selectedEvent: Earthquake? = null,
    val selectedCluster: List<Earthquake> = emptyList(),
    val remoteAlertsMessage: String? = null,
    val remoteAlertsBusy: Boolean = false,
)

class SismiViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SismiStore(application)
    private val repository = EarthquakeRepository()
    private val locationRepository = LocationRepository()
    private val notifications = SismiNotifications(application)
    private val remoteAlerts = RemoteAlertsClient(application)
    private val refreshMutex = Mutex()
    private var monitorJob: Job? = null
    private var locationSearchJob: Job? = null
    private var emscReconnectJob: Job? = null
    private var emscReconnectAttempts = 0
    private var emscSocket: WebSocket? = null
    private var remoteSyncJob: Job? = null
    private var automaticRegistrationJob: Job? = null
    private var initialRefreshComplete = false
    private val knownEventKeys = mutableSetOf<String>()
    private val alertedEventKeys = store.loadAlertedEventKeys()

    private val _state = MutableStateFlow(SismiUiState(settings = store.loadSettings()))
    val state: StateFlow<SismiUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val cached = store.loadEvents()
            if (cached.isNotEmpty()) {
                knownEventKeys += cached.map(::eventKey)
                if (_state.value.events.isEmpty()) _state.value = _state.value.copy(events = cached)
            }
        }
        if (_state.value.settings.remoteAlertsEnabled) {
            viewModelScope.launch(Dispatchers.IO) {
                if (!remoteAlerts.isRegistered()) {
                    _state.value = _state.value.copy(remoteAlertsMessage = "Vuelve a vincular este teléfono para reactivar los avisos remotos.")
                } else {
                    runCatching { remoteAlerts.sync(_state.value.settings) }
                        .onSuccess { _state.value = _state.value.copy(remoteAlertsMessage = "Avisos remotos conectados.") }
                        .onFailure { error -> _state.value = _state.value.copy(remoteAlertsMessage = error.message ?: "No se pudieron actualizar las preferencias remotas.") }
                }
            }
        }
    }

    fun startMonitoring() {
        if (monitorJob?.isActive == true) return
        monitorJob = viewModelScope.launch {
            refresh()
            connectEmsc()
            while (true) {
                delay(45_000)
                refresh()
            }
        }
    }

    fun stopMonitoring() {
        monitorJob?.cancel()
        monitorJob = null
        emscReconnectJob?.cancel()
        emscReconnectJob = null
        emscSocket?.close(1000, "Sismi en segundo plano")
        emscSocket = null
    }

    fun refresh() {
        viewModelScope.launch {
            refreshMutex.withLock {
                _state.value = _state.value.copy(refreshing = true, connectionMessage = null)
                runCatching { repository.refresh() }
                    .onSuccess(::acceptRefresh)
                    .onFailure { error ->
                        val cachedAvailable = _state.value.events.isNotEmpty()
                        _state.value = _state.value.copy(
                            refreshing = false,
                            connectionMessage = if (cachedAvailable) "Sin conexión. Mostramos los últimos datos guardados." else "No pudimos conectar con las fuentes. Revisa tu conexión e inténtalo de nuevo.",
                            sources = _state.value.sources.map { source ->
                                if (source.source == "EMSC") source else source.copy(error = error.message ?: "Sin respuesta")
                            },
                        )
                    }
            }
        }
    }

    private fun acceptRefresh(result: RefreshResult) {
        val currentTime = System.currentTimeMillis()
        val previousEvents = _state.value.events
        val freshEvents = result.events + previousEvents.filter { old -> result.events.none { it.source == old.source && it.id == old.id } }
        val newEvents = if (initialRefreshComplete) {
            result.events.filter { eventKey(it) !in knownEventKeys && currentTime - it.timestamp <= 15 * 60_000L }
        } else emptyList()
        knownEventKeys += result.events.map(::eventKey)
        initialRefreshComplete = true
        val finalEvents = freshEvents.sortedByDescending(Earthquake::timestamp).take(1200)
        val currentSources = _state.value.sources.filter { it.source == "EMSC" }
        _state.value = _state.value.copy(
            events = finalEvents,
            sources = result.sources + currentSources,
            refreshing = false,
            lastSyncAt = currentTime,
            connectionMessage = if (result.sources.any { !it.isAvailable }) "Una de las fuentes no respondió; conservamos las demás." else null,
        )
        viewModelScope.launch(Dispatchers.IO) {
            store.saveEvents(finalEvents)
            SismiWidget.updateAll(getApplication())
        }
        notifyMatchingEvents(newEvents)
    }

    private fun connectEmsc() {
        if (emscSocket != null) return
        updateSource("EMSC", FeedStatus("EMSC", error = "Conectando…"))
        emscSocket = repository.subscribeEmscRealtime(
            onStatus = { connected, error ->
                if (connected) emscReconnectAttempts = 0
                updateSource("EMSC", FeedStatus("EMSC", count = _state.value.sources.firstOrNull { it.source == "EMSC" }?.count ?: 0, error = if (connected) null else error ?: "Sin respuesta"))
                if (!connected) {
                    emscSocket = null
                    scheduleEmscReconnect()
                }
            },
            onEvent = { event ->
                viewModelScope.launch {
                    val current = _state.value.events
                    val existingIndex = current.indexOfFirst { it.source == event.source && it.id == event.id }
                    if (existingIndex >= 0) {
                        val prior = current[existingIndex]
                        val merged = if ((event.updatedAt ?: event.timestamp) >= (prior.updatedAt ?: prior.timestamp)) event else prior
                        if (merged != prior) {
                            val events = current.toMutableList().apply { set(existingIndex, merged) }.sortedByDescending(Earthquake::timestamp)
                            _state.value = _state.value.copy(events = events)
                            viewModelScope.launch(Dispatchers.IO) {
                                store.saveEvents(events)
                                SismiWidget.updateAll(getApplication())
                            }
                        }
                    } else {
                        val isNew = initialRefreshComplete && System.currentTimeMillis() - event.timestamp <= 15 * 60_000L && eventKey(event) !in knownEventKeys
                        knownEventKeys += eventKey(event)
                        val events = (listOf(event) + current).sortedByDescending(Earthquake::timestamp).take(1200)
                        _state.value = _state.value.copy(events = events)
                        viewModelScope.launch(Dispatchers.IO) {
                            store.saveEvents(events)
                            SismiWidget.updateAll(getApplication())
                        }
                        if (isNew) notifyMatchingEvents(listOf(event))
                    }
                    val emsc = _state.value.sources.firstOrNull { it.source == "EMSC" } ?: FeedStatus("EMSC")
                    updateSource("EMSC", emsc.copy(count = emsc.count + 1, error = null))
                }
            },
        )
    }

    private fun scheduleEmscReconnect() {
        if (monitorJob?.isActive != true || emscReconnectJob?.isActive == true) return
        val delayMs = (2_000L * (1L shl emscReconnectAttempts.coerceAtMost(4))).coerceAtMost(30_000L)
        emscReconnectAttempts += 1
        emscReconnectJob = viewModelScope.launch {
            delay(delayMs)
            emscReconnectJob = null
            if (monitorJob?.isActive == true) connectEmsc()
        }
    }

    private fun updateSource(name: String, status: FeedStatus) {
        val sources = _state.value.sources.filterNot { it.source == name } + status
        _state.value = _state.value.copy(sources = sources.sortedBy { listOf("SGC", "USGS", "EMSC").indexOf(it.source) })
    }

    private fun notifyMatchingEvents(events: List<Earthquake>) {
        val settings = _state.value.settings
        if (!settings.alertsEnabled || settings.doNotDisturb) return
        val matchingEvents = events.asSequence()
            .filter { it.magnitude >= settings.minimumMagnitude }
            .filter { settings.source == "Todas" || settings.source == it.source }
            .filter { settings.scope == EventScope.GLOBAL || distanceKm(settings.location.latitude, settings.location.longitude, it) <= settings.radiusKm }
            .filter { eventKey(it) !in alertedEventKeys }
            .take(settings.maxAlertsPerUpdate.coerceIn(1, 10))
            .toList()
        if (matchingEvents.isEmpty()) return
        matchingEvents.forEach { event ->
            val distance = distanceKm(settings.location.latitude, settings.location.longitude, event)
            val soundEnabled = settings.alertSound && !isQuietHours(settings)
            notifications.notifyEarthquake(event, distance.takeIf { settings.scope == EventScope.LOCATION }, soundEnabled)
            alertedEventKeys += eventKey(event)
        }
        store.saveAlertedEventKeys(alertedEventKeys)
    }

    fun updateSettings(transform: (SismiSettings) -> SismiSettings) {
        val updated = transform(_state.value.settings)
        _state.value = _state.value.copy(settings = updated)
        store.saveSettings(updated)
        viewModelScope.launch(Dispatchers.IO) { SismiWidget.updateAll(getApplication()) }
        scheduleRemoteSync(updated)
    }

    fun connectRemoteAlerts(serverUrl: String, pairingCode: String) {
        viewModelScope.launch {
            val settings = _state.value.settings.copy(remoteAlertsEnabled = true, remoteServerUrl = serverUrl.trim())
            _state.value = _state.value.copy(remoteAlertsBusy = true, remoteAlertsMessage = "Vinculando este teléfono…")
            runCatching { remoteAlerts.connect(serverUrl, pairingCode, settings) }
                .onSuccess {
                    _state.value = _state.value.copy(settings = settings, remoteAlertsBusy = false, remoteAlertsMessage = "Teléfono vinculado. Las preferencias de avisos ya están sincronizadas.")
                    store.saveSettings(settings)
                }
                .onFailure { error -> _state.value = _state.value.copy(remoteAlertsBusy = false, remoteAlertsMessage = error.message ?: "No se pudo vincular este teléfono.") }
        }
    }

    fun ensureAutomaticRemoteAlerts() {
        if (remoteAlerts.isRegistered() && _state.value.settings.remoteAlertsEnabled) return
        if (automaticRegistrationJob?.isActive == true) return
        automaticRegistrationJob = viewModelScope.launch(Dispatchers.IO) {
            val current = _state.value.settings
            val settings = current.copy(remoteAlertsEnabled = true)
            _state.value = _state.value.copy(remoteAlertsBusy = true, remoteAlertsMessage = "Configurando avisos en segundo plano…")
            runCatching { remoteAlerts.autoRegister(settings) }
                .onSuccess { serverUrl ->
                    val updated = settings.copy(remoteServerUrl = serverUrl)
                    store.saveSettings(updated)
                    _state.value = _state.value.copy(
                        settings = updated,
                        remoteAlertsBusy = false,
                        remoteAlertsMessage = "Avisos en segundo plano activados automáticamente.",
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        remoteAlertsBusy = false,
                        remoteAlertsMessage = error.message ?: "No se pudieron activar los avisos en segundo plano.",
                    )
                }
        }
    }

    fun disconnectRemoteAlerts() {
        viewModelScope.launch {
            val current = _state.value.settings
            _state.value = _state.value.copy(remoteAlertsBusy = true, remoteAlertsMessage = "Desconectando…")
            runCatching { remoteAlerts.disconnect(current) }
                .onSuccess {
                    val updated = current.copy(remoteAlertsEnabled = false)
                    store.saveSettings(updated)
                    _state.value = _state.value.copy(settings = updated, remoteAlertsBusy = false, remoteAlertsMessage = "Este teléfono ya no recibirá avisos remotos.")
                }
                .onFailure { error -> _state.value = _state.value.copy(remoteAlertsBusy = false, remoteAlertsMessage = error.message ?: "No se pudo desconectar del servidor.") }
        }
    }

    fun testRemoteAlert() {
        viewModelScope.launch {
            _state.value = _state.value.copy(remoteAlertsBusy = true, remoteAlertsMessage = "Enviando aviso de prueba…")
            runCatching { remoteAlerts.test(_state.value.settings) }
                .onSuccess { _state.value = _state.value.copy(remoteAlertsBusy = false, remoteAlertsMessage = "Aviso de prueba enviado. Puede tardar unos segundos en llegar.") }
                .onFailure { error -> _state.value = _state.value.copy(remoteAlertsBusy = false, remoteAlertsMessage = error.message ?: "No se pudo enviar el aviso de prueba.") }
        }
    }

    private fun scheduleRemoteSync(settings: SismiSettings) {
        if (!settings.remoteAlertsEnabled || !remoteAlerts.isRegistered()) return
        remoteSyncJob?.cancel()
        remoteSyncJob = viewModelScope.launch {
            delay(700)
            runCatching { remoteAlerts.sync(settings) }
                .onSuccess { _state.value = _state.value.copy(remoteAlertsMessage = "Preferencias remotas actualizadas.") }
                .onFailure { error -> _state.value = _state.value.copy(remoteAlertsMessage = error.message ?: "No se pudieron sincronizar las preferencias.") }
        }
    }

    fun selectLocation(location: SavedLocation) {
        updateSettings { it.copy(location = location, scope = EventScope.LOCATION) }
        _state.value = _state.value.copy(locationResults = emptyList(), locationError = null)
        refresh()
    }

    fun searchLocations(query: String) {
        locationSearchJob?.cancel()
        if (query.trim().length < 2) {
            _state.value = _state.value.copy(locationResults = emptyList(), locationError = null, searchingLocations = false)
            return
        }
        locationSearchJob = viewModelScope.launch {
            delay(250)
            _state.value = _state.value.copy(searchingLocations = true, locationError = null)
            runCatching { locationRepository.search(query) }
                .onSuccess { results -> _state.value = _state.value.copy(locationResults = results, searchingLocations = false) }
                .onFailure { error -> _state.value = _state.value.copy(locationResults = emptyList(), searchingLocations = false, locationError = error.message) }
        }
    }

    suspend fun useCurrentLocation(context: Context): String? = withContext(Dispatchers.Main) {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) return@withContext "Permite el acceso a la ubicación para continuar."
        runCatching {
            val client = LocationServices.getFusedLocationProviderClient(context)
            val cached = client.lastLocation.await()
            val location: Location? = cached ?: client.getCurrentLocation(
                CurrentLocationRequest.Builder()
                    .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                    .setMaxUpdateAgeMillis(30_000)
                    .build(),
                CancellationTokenSource().token,
            ).await()
            if (location == null) return@runCatching "No pudimos obtener la ubicación. Activa la ubicación del dispositivo e inténtalo de nuevo."
            selectLocation(SavedLocation("Mi ubicación", "", "", location.latitude, location.longitude))
            null
        }.getOrElse { error -> error.message ?: "No pudimos obtener la ubicación." }
    }

    fun clearLocationSearch() {
        _state.value = _state.value.copy(locationResults = emptyList(), locationError = null)
    }

    fun testNotification() {
        val settings = _state.value.settings
        notifications.test(settings.alertSound && !isQuietHours(settings))
    }

    private fun isQuietHours(settings: SismiSettings): Boolean {
        if (!settings.quietHours) return false
        val start = runCatching { LocalTime.parse(settings.quietHoursStart) }.getOrDefault(LocalTime.of(22, 0))
        val end = runCatching { LocalTime.parse(settings.quietHoursEnd) }.getOrDefault(LocalTime.of(7, 0))
        if (start == end) return false
        val now = LocalTime.now()
        return if (start.isBefore(end)) !now.isBefore(start) && now.isBefore(end)
        else !now.isBefore(start) || now.isBefore(end)
    }

    fun selectEvent(event: Earthquake) {
        _state.value = _state.value.copy(selectedEvent = event)
    }

    fun selectCluster(events: List<Earthquake>) {
        _state.value = _state.value.copy(selectedCluster = events)
    }

    private fun eventKey(event: Earthquake) = "${event.source}:${event.id}"

    override fun onCleared() {
        remoteSyncJob?.cancel()
        stopMonitoring()
        super.onCleared()
    }
}
