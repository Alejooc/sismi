package com.sismi.android.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.app.TimePickerDialog
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.sismi.android.BuildConfig
import com.sismi.android.R
import com.sismi.android.data.Earthquake
import com.sismi.android.data.EventScope
import com.sismi.android.data.FeedStatus
import com.sismi.android.data.SavedLocation
import com.sismi.android.data.SismiSettings
import com.sismi.android.data.SismiTime
import com.sismi.android.data.distanceKm
import com.sismi.android.notifications.SismiNotifications
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.time.LocalTime

private enum class HomeTab { SUMMARY, HISTORY, MAP }

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun HomeScreen(
    state: SismiUiState,
    model: SismiViewModel,
    onOpenSettings: () -> Unit,
    onOpenSafety: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenEvent: (Earthquake) -> Unit,
    onOpenCluster: (List<Earthquake>) -> Unit,
) {
    var tab by remember { mutableStateOf(HomeTab.SUMMARY) }
    val scopeEvents = remember(state.events, state.settings) {
        if (state.settings.scope == EventScope.GLOBAL) state.events
        else state.events.filter { distanceKm(state.settings.location.latitude, state.settings.location.longitude, it) <= state.settings.radiusKm }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(
                            Modifier.size(38.dp).clip(CircleShape).background(Color(0xFF174C39)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(painterResource(R.drawable.sismi_logo), "Logo de Sismi", Modifier.size(36.dp))
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text("Sismi", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                if (state.settings.scope == EventScope.GLOBAL) "Monitoreo global" else state.settings.location.name,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                },
                actions = {
                    Row(
                        Modifier.padding(end = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        IconButton(
                            onClick = { model.updateSettings { it.copy(darkMode = !it.darkMode) } },
                            modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
                        ) {
                            Icon(if (state.settings.darkMode) Icons.Default.LightMode else Icons.Default.DarkMode, "Cambiar apariencia")
                        }
                        IconButton(
                            onClick = onOpenSettings,
                            modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
                        ) { Icon(Icons.Default.Settings, "Configuración") }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                val itemColors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                NavigationBarItem(selected = tab == HomeTab.SUMMARY, onClick = { tab = HomeTab.SUMMARY }, icon = { Icon(Icons.Default.Sensors, null) }, label = { Text("Resumen") }, colors = itemColors)
                NavigationBarItem(selected = tab == HomeTab.HISTORY, onClick = { tab = HomeTab.HISTORY }, icon = { Icon(Icons.Default.History, null) }, label = { Text("Historial") }, colors = itemColors)
                NavigationBarItem(selected = tab == HomeTab.MAP, onClick = { tab = HomeTab.MAP }, icon = { Icon(Icons.Default.Map, null) }, label = { Text("Mapa") }, colors = itemColors)
            }
        },
    ) { padding ->
        when (tab) {
            HomeTab.SUMMARY -> SummaryScreen(
                state = state,
                events = scopeEvents,
                onScopeChange = { selected -> model.updateSettings { it.copy(scope = selected) } },
                onRefresh = model::refresh,
                onOpenEvent = onOpenEvent,
                onOpenHistory = { tab = HomeTab.HISTORY },
                onOpenSafety = onOpenSafety,
                onOpenAbout = onOpenAbout,
                modifier = Modifier.padding(padding),
            )
            HomeTab.HISTORY -> HistoryScreen(
                state = state,
                events = scopeEvents,
                onScopeChange = { selected -> model.updateSettings { it.copy(scope = selected) } },
                onOpenEvent = onOpenEvent,
                modifier = Modifier.padding(padding),
            )
            HomeTab.MAP -> EarthquakeMapScreen(
                events = state.events,
                settings = state.settings,
                onScopeChange = { selected -> model.updateSettings { it.copy(scope = selected) } },
                onOpenEvent = onOpenEvent,
                onOpenCluster = onOpenCluster,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun SummaryScreen(
    state: SismiUiState,
    events: List<Earthquake>,
    onScopeChange: (EventScope) -> Unit,
    onRefresh: () -> Unit,
    onOpenEvent: (Earthquake) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSafety: () -> Unit,
    onOpenAbout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val recentEvents = events.take(5)
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize(),
    ) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, top = 10.dp, end = 16.dp, bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { ScopeSelector(state.settings.scope, onScopeChange) }
        item {
            val latest = events.firstOrNull()
            if (latest == null) {
                EmptyEventsCard(state.refreshing)
            } else {
                LatestEventCard(latest, state.settings, onClick = { onOpenEvent(latest) })
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text("Actividad reciente", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(if (state.settings.scope == EventScope.GLOBAL) "En todo el mundo" else "Cerca de ${state.settings.location.name}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                }
                TextButton(onClick = onOpenHistory) { Text("Ver historial") }
            }
        }
        if (recentEvents.isEmpty()) {
            item { EmptyEventsCard(state.refreshing) }
        } else {
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column {
                        recentEvents.forEachIndexed { index, event ->
                            CompactEventRow(event, state.settings, onClick = { onOpenEvent(event) })
                            if (index < recentEvents.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                }
            }
        }
        item {
            Card(
                onClick = onOpenSafety,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            ) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.68f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Shield, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Prepárate para un sismo", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        Text("Guía y contactos de emergencia", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.78f))
                    }
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = onOpenAbout) {
                    Icon(Icons.Default.Info, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Acerca de Sismi")
                }
            }
        }
    }
    }
}

@Composable
private fun StatusCard(state: SismiUiState, onRefresh: () -> Unit) {
    Card(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Fuentes sísmicas", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Text(
                        state.lastSyncAt?.let { "Actualizado ${formatClock(it)}" } ?: "Consultando fuentes oficiales",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(
                    onClick = onRefresh,
                    enabled = !state.refreshing,
                    modifier = Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    if (state.refreshing) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Default.Refresh, "Actualizar datos", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.fillMaxWidth()) {
                state.sources.forEach { SourceStatusTile(it, Modifier.weight(1f)) }
            }
            state.connectionMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun SourceStatusTile(status: FeedStatus, modifier: Modifier = Modifier) {
    val isOnline = status.isAvailable && (status.count > 0 || status.error == null)
    Column(
        modifier.clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 9.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (isOnline) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error))
            Text(status.source, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Text(
            when {
                status.error == "Conectando…" -> "Conectando"
                status.isAvailable -> "${status.count} registros"
                else -> "Sin respuesta"
            },
            style = MaterialTheme.typography.labelSmall,
            color = if (isOnline) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SourceLine(status: FeedStatus) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (status.isAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error))
        Text(status.source, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(
            when {
                status.error == "Conectando…" -> "Conectando"
                status.isAvailable -> "${status.count} registros"
                else -> "Sin respuesta"
            },
            color = if (status.isAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

@Composable
private fun EmptyEventsCard(refreshing: Boolean) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (refreshing) CircularProgressIndicator(Modifier.size(24.dp)) else Icon(Icons.Default.Sensors, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            Text(if (refreshing) "Buscando sismos recientes…" else "Todavía no hay registros para mostrar", fontWeight = FontWeight.SemiBold)
            Text("Puedes actualizar o cambiar el alcance de la consulta.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun LatestEventCard(event: Earthquake, settings: SismiSettings, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                    Text("Sismo más reciente", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                }
                Text(formatClock(event.timestamp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MagnitudeBadge(event, Modifier.size(60.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(event.place, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${event.source} · ${formatDate(event.timestamp)}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(0.dp), modifier = Modifier.fillMaxWidth()) {
                MetricChip("Profundidad", event.depthKm?.let { "${it.toInt()} km" } ?: "—", Modifier.weight(1f))
                MetricChip(if (settings.scope == EventScope.GLOBAL) "A tu ubicación" else "Distancia", "${distanceKm(settings.location.latitude, settings.location.longitude, event).toInt()} km", Modifier.weight(1f))
                MetricChip("Fuente", event.source, Modifier.weight(1f))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Ver información completa", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
            }
        }
    }
}

@Composable
private fun MetricChip(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(end = 6.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 9.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun CompactEventRow(event: Earthquake, settings: SismiSettings, onClick: () -> Unit) {
    val magnitudeColor = magnitudeColorFor(event.magnitude)
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(magnitudeColor.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(0.dp)) {
                Text("%.1f".format(Locale.US, event.magnitude), color = magnitudeColor, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                Text(event.magnitudeType, color = magnitudeColor, style = MaterialTheme.typography.labelSmall)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(event.place, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${event.source} · ${event.depthKm?.toInt()?.let { "$it km" } ?: "Prof. —"} · ${distanceKm(settings.location.latitude, settings.location.longitude, event).toInt()} km",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(formatClock(event.timestamp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun ScopeSelector(scope: EventScope, onScopeChange: (EventScope) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ScopeOption("Mi zona", scope == EventScope.LOCATION, { onScopeChange(EventScope.LOCATION) }, Modifier.weight(1f))
        ScopeOption("Todo el mundo", scope == EventScope.GLOBAL, { onScopeChange(EventScope.GLOBAL) }, Modifier.weight(1f))
    }
}

@Composable
private fun ScopeOption(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val background = if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
    val foreground = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier.height(40.dp).clip(RoundedCornerShape(10.dp)).background(background).clickable(onClick = onClick).padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (label == "Todo el mundo") Icons.Default.Public else Icons.Default.LocationOn, null, tint = if (selected) MaterialTheme.colorScheme.primary else foreground, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, color = foreground, maxLines = 1)
    }
}

@Composable
private fun ScopePill(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val container = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
    val content = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
    Surface(
        modifier = modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        color = container,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outline),
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            Icon(if (label.contains("mundo")) Icons.Default.Public else Icons.Default.LocationOn, null, tint = content, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(5.dp))
            Text(label, color = content, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

@Composable
private fun HistoryScreen(
    state: SismiUiState,
    events: List<Earthquake>,
    onScopeChange: (EventScope) -> Unit,
    onOpenEvent: (Earthquake) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    var source by remember { mutableStateOf("Todas") }
    var filtersOpen by remember { mutableStateOf(false) }
    var period by remember { mutableStateOf("Todo") }
    var minimumMagnitude by remember { mutableFloatStateOf(0f) }
    val now = System.currentTimeMillis()
    val cutoff = when (period) {
        "24 h" -> now - 24 * 60 * 60 * 1000L
        "7 días" -> now - 7 * 24 * 60 * 60 * 1000L
        "30 días" -> now - 30 * 24 * 60 * 60 * 1000L
        else -> Long.MIN_VALUE
    }
    val filtered = remember(events, query, source, period, minimumMagnitude) {
        events.filter { event ->
            (source == "Todas" || event.source == source) &&
                (query.isBlank() || event.place.contains(query, true) || event.source.contains(query, true)) &&
                event.timestamp >= cutoff && event.magnitude >= minimumMagnitude
        }
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Registros de ${if (state.settings.scope == EventScope.GLOBAL) "todo el mundo" else state.settings.location.name}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Historial sísmico", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = CircleShape) { Text("${filtered.size}", Modifier.padding(horizontal = 10.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ScopePill("Mi zona", state.settings.scope == EventScope.LOCATION, { onScopeChange(EventScope.LOCATION) }, Modifier.weight(1f))
                ScopePill("Todo el mundo", state.settings.scope == EventScope.GLOBAL, { onScopeChange(EventScope.GLOBAL) }, Modifier.weight(1f))
            }
        }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("Buscar lugar o fuente") }, singleLine = true, shape = RoundedCornerShape(12.dp))
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Filtros avanzados", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                TextButton(onClick = { filtersOpen = !filtersOpen }) {
                    Icon(Icons.Default.FilterList, null, Modifier.size(17.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(if (filtersOpen) "Ocultar" else "Filtrar")
                }
            }
            if (filtersOpen) {
                Text("Fuente", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    listOf("Todas", "SGC", "USGS", "EMSC").forEach { item -> FilterPill(item, source == item) { source = item } }
                }
                Text("Periodo", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    listOf("Todo", "24 h", "7 días", "30 días").forEach { item -> FilterPill(item, period == item) { period = item } }
                }
                Text("Magnitud mínima", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    listOf(0f to "Todas", 3f to "3+", 4f to "4+", 5f to "5+").forEach { (value, label) ->
                        FilterPill(label, minimumMagnitude == value) { minimumMagnitude = value }
                    }
                }
            }
        }
        if (filtered.isEmpty()) item { EmptyEventsCard(state.refreshing) }
        items(filtered, key = { "${it.source}:${it.id}" }) { event -> EventRow(event, state.settings, onClick = { onOpenEvent(event) }) }
    }
}

@Composable
private fun FilterPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clip(CircleShape).clickable(onClick = onClick),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shape = CircleShape,
    ) { Text(label, Modifier.padding(horizontal = 14.dp, vertical = 8.dp), color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun EventRow(event: Earthquake, settings: SismiSettings, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MagnitudeBadge(event, Modifier.size(44.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(event.place, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${event.depthKm?.toInt()?.let { "$it km" } ?: "Profundidad —"} · ${event.source} · ${distanceKm(settings.location.latitude, settings.location.longitude, event).toInt()} km", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(formatClock(event.timestamp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Text(event.magnitudeType, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
fun MagnitudeBadge(event: Earthquake, modifier: Modifier = Modifier) {
    val tint = magnitudeColorFor(event.magnitude)
    Box(modifier.clip(RoundedCornerShape(14.dp)).background(tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("%.1f".format(Locale.US, event.magnitude), fontWeight = FontWeight.Bold, color = tint, fontSize = 17.sp)
            Text(event.magnitudeType, fontWeight = FontWeight.SemiBold, color = tint, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private fun magnitudeColorFor(magnitude: Double): Color = when {
    magnitude >= 5.5 -> Color(0xFFC85C5C)
    magnitude >= 4.5 -> Color(0xFFD57C4A)
    magnitude >= 3.0 -> Color(0xFFC89A45)
    else -> Color(0xFF5F9F7B)
}

private fun formatZoneNow(): String = DateTimeFormatter.ofPattern("d MMM · h:mm:ss a", Locale.forLanguageTag("es-CO"))
    .withZone(SismiTime.zone)
    .format(Instant.now())
    .lowercase(Locale.forLanguageTag("es-CO"))

@Composable
fun SettingsScreen(state: SismiUiState, model: SismiViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val coroutineScope = rememberCoroutineScope()
    var locationQuery by remember { mutableStateOf("") }
    var locationFeedback by remember { mutableStateOf<String?>(null) }
    var enableAlertsAfterPermission by remember { mutableStateOf(false) }
    var testAfterPermission by remember { mutableStateOf(false) }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) coroutineScope.launch { locationFeedback = model.useCurrentLocation(context) }
        else locationFeedback = "No se concedió el permiso de ubicación. Puedes elegir una ciudad manualmente."
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (enableAlertsAfterPermission) model.updateSettings { it.copy(alertsEnabled = granted) }
        if (testAfterPermission && granted) model.testNotification()
        enableAlertsAfterPermission = false
        testAfterPermission = false
    }

    Scaffold(topBar = { PageTopBar("Configuración", "Ubicación y avisos", onBack) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                SettingsCard("Tu ubicación", Icons.Default.LocationOn) {
                    Text("Actual", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(state.settings.location.label, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                    OutlinedTextField(
                        value = locationQuery,
                        onValueChange = { locationQuery = it; model.searchLocations(it) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("Buscar ciudad o región") },
                        leadingIcon = { Icon(Icons.Default.Search, null) },
                        shape = RoundedCornerShape(12.dp),
                    )
                    if (state.searchingLocations) LinearLoading()
                    state.locationError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    state.locationResults.forEach { location ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { model.selectLocation(location); locationQuery = ""; focusManager.clearFocus() }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocationOn, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            Text(location.label, Modifier.weight(1f), maxLines = 2)
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, modifier = Modifier.size(16.dp))
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f))
                    }
                    FilledTonalButton(onClick = {
                        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        if (fine || coarse) coroutineScope.launch { locationFeedback = model.useCurrentLocation(context) }
                        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                    }) {
                        Icon(Icons.Default.MyLocation, null, Modifier.size(18.dp)); Spacer(Modifier.width(7.dp)); Text("Usar mi ubicación")
                    }
                    locationFeedback?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
                    Text("Radio de vigilancia · ${state.settings.radiusKm} km", fontWeight = FontWeight.Medium)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(100, 250, 500, 1000).forEach { radius -> FilterPill("${radius} km", state.settings.radiusKm == radius) { model.updateSettings { it.copy(radiusKm = radius) } } }
                    }
                }
            }
            item {
                SettingsCard("Zona horaria", Icons.Default.Schedule) {
                    Text(
                        "Sismi usa automáticamente la zona horaria configurada en este teléfono.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("Zona detectada", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(SismiTime.zoneId, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("Hora actual", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(formatZoneNow(), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            item {
                SettingsCard("Avisos", Icons.Default.NotificationsActive) {
                    SettingSwitch("Recibir notificaciones", "Preferencia visual de avisos de Sismi", state.settings.alertsEnabled) { enabled ->
                        if (!enabled) model.updateSettings { it.copy(alertsEnabled = false) }
                        else if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            enableAlertsAfterPermission = true
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else model.updateSettings { it.copy(alertsEnabled = true) }
                    }
                    Text(
                        "Las alertas inteligentes respetan magnitud, distancia, fuente y horario silencioso, y evitan repetir el mismo evento.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    SettingSwitch("Sonido de alerta", "Usa el tono de alarma del teléfono", state.settings.alertSound) { enabled -> model.updateSettings { it.copy(alertSound = enabled) } }
                    OutlinedButton(onClick = {
                        val intent = Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                            putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
                            putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, SismiNotifications.ALERT_CHANNEL_SOUND)
                        }
                        runCatching { context.startActivity(intent) }
                    }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.NotificationsActive, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(7.dp))
                        Text("Ajustar sonido en Android")
                    }
                    Text("Avisar desde magnitud ${"%.1f".format(Locale.US, state.settings.minimumMagnitude)}", fontWeight = FontWeight.Medium)
                    Slider(value = state.settings.minimumMagnitude, onValueChange = { value -> model.updateSettings { it.copy(minimumMagnitude = value) } }, valueRange = 1f..7f, steps = 11)
                    Text("Máximo ${state.settings.maxAlertsPerUpdate} avisos por actualización", fontWeight = FontWeight.Medium)
                    Slider(value = state.settings.maxAlertsPerUpdate.toFloat(), onValueChange = { value -> model.updateSettings { it.copy(maxAlertsPerUpdate = value.toInt().coerceIn(1, 10)) } }, valueRange = 1f..10f, steps = 8)
                    Text("Alcance de avisos", fontWeight = FontWeight.Medium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ScopePill("Mi zona", state.settings.scope == EventScope.LOCATION, { model.updateSettings { it.copy(scope = EventScope.LOCATION) } }, Modifier.weight(1f))
                        ScopePill("Todo el mundo", state.settings.scope == EventScope.GLOBAL, { model.updateSettings { it.copy(scope = EventScope.GLOBAL) } }, Modifier.weight(1f))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Fuente", Modifier.weight(1f), fontWeight = FontWeight.Medium)
                        listOf("Todas", "SGC", "USGS", "EMSC").forEach { FilterPill(it, state.settings.source == it) { model.updateSettings { current -> current.copy(source = it) } } }
                    }
                    SettingSwitch("No molestar", "Pausa todos los avisos de Sismi", state.settings.doNotDisturb) { enabled -> model.updateSettings { it.copy(doNotDisturb = enabled) } }
                    SettingSwitch("Horario silencioso", "${formatQuietTime(state.settings.quietHoursStart)} a ${formatQuietTime(state.settings.quietHoursEnd)}", state.settings.quietHours) { enabled -> model.updateSettings { it.copy(quietHours = enabled) } }
                    if (state.settings.quietHours) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { showTimePicker(context, state.settings.quietHoursStart) { value -> model.updateSettings { it.copy(quietHoursStart = value) } } }, modifier = Modifier.weight(1f)) { Text("Desde ${formatQuietTime(state.settings.quietHoursStart)}") }
                            OutlinedButton(onClick = { showTimePicker(context, state.settings.quietHoursEnd) { value -> model.updateSettings { it.copy(quietHoursEnd = value) } } }, modifier = Modifier.weight(1f)) { Text("Hasta ${formatQuietTime(state.settings.quietHoursEnd)}") }
                        }
                    }
                    OutlinedButton(onClick = {
                        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            enableAlertsAfterPermission = false
                            testAfterPermission = true
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else model.testNotification()
                    }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Notifications, null, Modifier.size(18.dp)); Spacer(Modifier.width(7.dp)); Text("Probar notificación") }
                }
            }
            item {
                SettingsCard("Apariencia", Icons.Default.DarkMode) {
                    SettingSwitch("Tema oscuro", "Fondo negro y texto claro", state.settings.darkMode) { enabled -> model.updateSettings { it.copy(darkMode = enabled) } }
                }
            }
            item {
                SettingsCard("Información", Icons.Default.Info) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text("Estado de datos", fontWeight = FontWeight.SemiBold)
                            Text("Fuentes oficiales y detección rápida", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        TextButton(onClick = model::refresh) { Text("Actualizar") }
                    }
                    state.sources.forEach { SourceLine(it) }
                    OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Volver al resumen") }
                }
            }
        }
    }
}

@Composable
private fun SettingsCard(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, content: @Composable ColumnScope.() -> Unit) {
    Card(
        shape = RoundedCornerShape(17.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                }
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            content()
        }
    }
}

@Composable
private fun SettingSwitch(title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
        Switch(checked, onCheckedChange)
    }
}

@Composable
private fun LinearLoading() {
    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
}

@Composable
fun SafetyScreen(onBack: () -> Unit) {
    Scaffold(topBar = { PageTopBar("Modo seguridad", "Guía guardada en el teléfono", onBack) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { GuideCard("Antes", "Asegura muebles altos y objetos pesados. Identifica lugares seguros, rutas de salida y puntos de encuentro. Ten agua, linterna, radio, documentos y medicinas a mano.") }
            item { GuideCard("Durante", "En una construcción sismorresistente, agáchate, cúbrete y sujétate cerca de una columna o bajo un escritorio, lejos de ventanas. En una construcción informal, intenta salir solo si puedes hacerlo con seguridad. No uses ascensores ni te refugies en el marco de una puerta. Afuera, busca un espacio abierto lejos de edificios, postes y cables.") }
            item { GuideCard("Después", "Espera posibles réplicas, revisa si hay personas heridas y evita edificios dañados. Si hueles gas, no enciendas interruptores ni llamas y aléjate del lugar. Si estás en la costa y el sismo fue tan fuerte que costaba mantenerse de pie, desplázate a una zona alta y sigue las indicaciones oficiales.") }
            item {
                SettingsCard("Contactos de emergencia · Colombia", Icons.Default.Security) {
                    EmergencyContact("Emergencias", "123")
                    EmergencyContact("Bomberos", "119")
                    EmergencyContact("Cruz Roja", "132")
                    Text("Si estás en otro país, llama al número local de emergencias.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
            }
            item { Text("Guía resumida a partir de recomendaciones del Servicio Geológico Colombiano y la UNGRD. Sigue siempre las instrucciones de las autoridades locales; Sismi no reemplaza los sistemas oficiales de alerta.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun GuideCard(title: String, description: String) {
    val index = when (title) { "Antes" -> "01"; "Durante" -> "02"; else -> "03" }
    Card(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                    Text(index, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun EmergencyContact(name: String, number: String) {
    val context = LocalContext.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { dialNumber(context, number) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Call, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(19.dp))
        Spacer(Modifier.width(9.dp))
        Text(name, Modifier.weight(1f), fontWeight = FontWeight.Medium)
        Text(number, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
    }
}

private fun dialNumber(context: Context, number: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))) }
}

private fun showTimePicker(context: Context, value: String, onSelected: (String) -> Unit) {
    val time = runCatching { LocalTime.parse(value) }.getOrDefault(LocalTime.of(22, 0))
    TimePickerDialog(context, { _, hour, minute -> onSelected("%02d:%02d".format(hour, minute)) }, time.hour, time.minute, false).show()
}

private fun formatQuietTime(value: String): String = runCatching {
    LocalTime.parse(value).format(DateTimeFormatter.ofPattern("h:mm a", Locale.forLanguageTag("es-CO"))).lowercase(Locale.forLanguageTag("es-CO"))
}.getOrDefault(value)

@Composable
fun AboutScreen(onBack: () -> Unit) {
    Scaffold(topBar = { PageTopBar("Acerca de Sismi", "Información de la aplicación", onBack) }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Box(Modifier.size(78.dp).clip(CircleShape).background(Color(0xFF174C39)), contentAlignment = Alignment.Center) {
                            Image(painterResource(R.drawable.sismi_logo), "Logo de Sismi", Modifier.size(74.dp))
                        }
                        Text("Sismi", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Información sísmica para tu entorno", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = CircleShape) {
                            Text("Android · ${BuildConfig.VERSION_NAME}", Modifier.padding(horizontal = 12.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            item {
                SettingsCard("Fuentes de información", Icons.Default.Public) {
                    AboutSource("SGC", "Servicio Geológico Colombiano")
                    AboutSource("USGS", "Servicio Geológico de Estados Unidos")
                    AboutSource("EMSC", "Centro Sismológico Euro-Mediterráneo")
                }
            }
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                ) {
                    Row(Modifier.fillMaxWidth().padding(15.dp), horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Info, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 1.dp).size(19.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Información importante", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                            Text("Los datos pueden publicarse con retraso. Sismi es informativa y no reemplaza los avisos oficiales de emergencia.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.82f))
                        }
                    }
                }
            }
            item { Text("Mapa © OpenStreetMap contributors", Modifier.padding(start = 3.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun AboutSource(name: String, description: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun PageTopBar(title: String, subtitle: String, onBack: () -> Unit) {
    TopAppBar(
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

private fun formatClock(timestamp: Long): String = DateTimeFormatter.ofPattern("h:mm a", Locale.forLanguageTag("es-CO"))
    .withZone(SismiTime.zone).format(Instant.ofEpochMilli(timestamp)).lowercase(Locale.forLanguageTag("es-CO"))

private fun formatDate(timestamp: Long): String = DateTimeFormatter.ofPattern("d MMM yyyy · h:mm a", Locale.forLanguageTag("es-CO"))
    .withZone(SismiTime.zone).format(Instant.ofEpochMilli(timestamp)).lowercase(Locale.forLanguageTag("es-CO"))
