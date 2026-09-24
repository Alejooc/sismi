package com.sismi.android.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.ColorMatrixColorFilter
import android.graphics.Point
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.sismi.android.data.Earthquake
import com.sismi.android.data.EventScope
import com.sismi.android.data.SismiSettings
import com.sismi.android.data.SismiTime
import com.sismi.android.data.distanceKm
import kotlinx.coroutines.delay
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.TilesOverlay
import java.util.Locale

private data class EventCluster(val latitude: Double, val longitude: Double, val events: List<Earthquake>)

private val DarkMapTileFilter = ColorMatrixColorFilter(
    floatArrayOf(
        -0.34f, -0.44f, -0.04f, 0f, 210f,
        -0.34f, -0.44f, -0.04f, 0f, 220f,
        -0.34f, -0.44f, -0.04f, 0f, 225f,
        0f, 0f, 0f, 1f, 0f,
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EarthquakeMapScreen(
    events: List<Earthquake>,
    settings: SismiSettings,
    onScopeChange: (com.sismi.android.data.EventScope) -> Unit,
    onOpenEvent: (Earthquake) -> Unit,
    onOpenCluster: (List<Earthquake>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var filtersOpen by remember { mutableStateOf(false) }
    var timelineOpen by remember { mutableStateOf(false) }
    var timelinePlaying by remember { mutableStateOf(false) }
    var minimumMagnitude by remember { mutableFloatStateOf(0f) }
    var selectedSource by remember { mutableStateOf("Todas") }
    var placeQuery by remember { mutableStateOf("") }
    var period by remember { mutableStateOf("Todo") }
    var timelineAt by remember { mutableStateOf<Long?>(null) }
    val now = System.currentTimeMillis()
    val cutoff = when (period) {
        "24 h" -> now - 24 * 60 * 60 * 1000L
        "7 días" -> now - 7 * 24 * 60 * 60 * 1000L
        "30 días" -> now - 30 * 24 * 60 * 60 * 1000L
        else -> Long.MIN_VALUE
    }
    val baseEvents = remember(events, settings, minimumMagnitude, selectedSource, placeQuery, period) {
        events.filter { event ->
            val inScope = settings.scope == EventScope.GLOBAL ||
                distanceKm(settings.location.latitude, settings.location.longitude, event) <= settings.radiusKm
            val matchesQuery = placeQuery.isBlank() ||
                listOf(event.place, event.source, event.agency, event.status).any { it?.contains(placeQuery, ignoreCase = true) == true }
            inScope && event.magnitude >= minimumMagnitude && event.timestamp >= cutoff &&
                (selectedSource == "Todas" || event.source == selectedSource) && matchesQuery &&
                event.latitude.isFinite() && event.longitude.isFinite()
        }
    }
    val selectedTimelineAt = timelineAt
    val visibleEvents = remember(baseEvents, timelineAt) {
        if (selectedTimelineAt == null) baseEvents else baseEvents.filter { it.timestamp <= selectedTimelineAt }
    }
    val timeBounds = remember(baseEvents) {
        (baseEvents.minOfOrNull(Earthquake::timestamp) ?: 0L) to (baseEvents.maxOfOrNull(Earthquake::timestamp) ?: 0L)
    }
    val timelineProgress = if (timelineAt == null || timeBounds.second <= timeBounds.first) 1f else
        ((timelineAt!!.toDouble() - timeBounds.first) / (timeBounds.second - timeBounds.first)).toFloat().coerceIn(0f, 1f)
    val activeFilterCount = listOf(
        minimumMagnitude > 0f,
        selectedSource != "Todas",
        placeQuery.isNotBlank(),
        period != "Todo",
    ).count { it }
    LaunchedEffect(timelinePlaying, timeBounds) {
        if (!timelinePlaying || timeBounds.second <= timeBounds.first) return@LaunchedEffect
        if (timelineAt == null || timelineAt!! >= timeBounds.second) timelineAt = timeBounds.first
        val step = ((timeBounds.second - timeBounds.first) / 72).coerceAtLeast(60_000L)
        while (timelinePlaying && timelineAt != null && timelineAt!! < timeBounds.second) {
            delay(180)
            val next = (timelineAt!! + step).coerceAtMost(timeBounds.second)
            timelineAt = next
            if (next >= timeBounds.second) timelinePlaying = false
        }
    }
    val context = LocalContext.current
    val mapView = remember(settings.location, settings.scope) {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(if (settings.scope.name == "GLOBAL") 2.1 else 5.0)
            controller.setCenter(if (settings.scope.name == "GLOBAL") GeoPoint(15.0, 0.0) else GeoPoint(settings.location.latitude, settings.location.longitude))
            setUseDataConnection(true)
        }
    }
    var mapRevision by remember { mutableIntStateOf(0) }
    DisposableEffect(mapView) {
        val handler = Handler(Looper.getMainLooper())
        val refreshClusters = Runnable { mapRevision++ }
        val mapListener = object : MapListener {
            override fun onScroll(event: ScrollEvent): Boolean {
                handler.removeCallbacks(refreshClusters)
                handler.postDelayed(refreshClusters, 140)
                return true
            }

            override fun onZoom(event: ZoomEvent): Boolean {
                handler.removeCallbacks(refreshClusters)
                handler.postDelayed(refreshClusters, 140)
                return true
            }
        }
        mapView.addMapListener(mapListener)
        mapView.onResume()
        mapView.post { mapRevision++ }
        onDispose {
            handler.removeCallbacks(refreshClusters)
            mapView.removeMapListener(mapListener)
            mapView.onPause()
            mapView.onDetach()
        }
    }
    val fallbackCellDegrees = if (settings.scope.name == "GLOBAL") 16.0 else (settings.radiusKm / 110.0).coerceIn(1.5, 8.0)
    val clusters = remember(visibleEvents, mapRevision, mapView, fallbackCellDegrees) {
        clusterEventsForViewport(visibleEvents, mapView, fallbackCellDegrees)
    }

    Column(modifier.fillMaxSize().padding(horizontal = 13.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("Mapa sísmico", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Explora los eventos y su evolución", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Surface(shape = RoundedCornerShape(13.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), horizontalAlignment = Alignment.End) {
                    Text("${visibleEvents.size}", color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Text(if (visibleEvents.size == 1) "sismo" else "sismos", color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            MapScopeSegment("Mi zona", Icons.Default.LocationOn, settings.scope == EventScope.LOCATION, Modifier.weight(1f)) { onScopeChange(EventScope.LOCATION) }
            MapScopeSegment("Todo el mundo", Icons.Default.Public, settings.scope == EventScope.GLOBAL, Modifier.weight(1f)) { onScopeChange(EventScope.GLOBAL) }
        }
        if (settings.scope == EventScope.LOCATION) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(Icons.Default.LocationOn, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                Text("${settings.location.name} · radio ${settings.radiusKm} km", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            MapToolButton(
                modifier = Modifier.weight(1f),
                icon = { Icon(Icons.Default.FilterList, null, Modifier.size(19.dp)) },
                title = "Filtros",
                subtitle = if (activeFilterCount == 0) "Fuente, fecha y magnitud" else "$activeFilterCount filtros activos",
                selected = filtersOpen,
                badge = activeFilterCount.takeIf { it > 0 }?.toString(),
                onClick = { filtersOpen = true },
            )
            MapToolButton(
                modifier = Modifier.weight(1f),
                icon = { Icon(Icons.Default.Timeline, null, Modifier.size(19.dp)) },
                title = "Línea de tiempo",
                subtitle = timelineAt?.let(::formatTimelineTime) ?: "Recorre los sismos",
                selected = timelineOpen,
                badge = if (timelineAt != null) "•" else null,
                onClick = { timelineOpen = true },
            )
        }

        SismiMapViewport(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            mapView = mapView,
            darkMode = settings.darkMode,
            statusTitle = "${visibleEvents.size} sismos visibles",
            statusSubtitle = "${clusters.size} grupos en el mapa",
            onCenter = {
                mapView.controller.animateTo(GeoPoint(settings.location.latitude, settings.location.longitude))
                mapView.controller.setZoom(6.5)
            },
            onWorld = {
                mapView.controller.animateTo(GeoPoint(15.0, 0.0))
                mapView.controller.setZoom(2.2)
            },
            onUpdateMarkers = { view ->
                view.overlays.removeAll { it is Marker }
                clusters.forEach { cluster ->
                    val representative = cluster.events.maxByOrNull(Earthquake::magnitude) ?: return@forEach
                    val marker = Marker(view).apply {
                        position = GeoPoint(cluster.latitude, cluster.longitude)
                        title = if (cluster.events.size > 1) "${cluster.events.size} sismos cercanos" else "M ${"%.1f".format(Locale.US, representative.magnitude)} · ${representative.place}"
                        snippet = "${cluster.events.size} registros · toca para ver"
                        icon = clusterMarkerDrawable(context, cluster.events.size, representative.magnitude)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        setOnMarkerClickListener { _, _ ->
                            if (cluster.events.size == 1) onOpenEvent(representative)
                            else onOpenCluster(cluster.events.sortedByDescending(Earthquake::timestamp))
                            true
                        }
                    }
                    view.overlays.add(marker)
                }
                view.invalidate()
            },
        )
        Text("Arrastra para explorar · pellizca para acercar", modifier = Modifier.align(Alignment.End), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

    if (filtersOpen) {
        ModalBottomSheet(onDismissRequest = { filtersOpen = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(Modifier.fillMaxWidth().heightIn(max = 680.dp).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Filtros del mapa", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Ajusta qué sismos aparecen", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { filtersOpen = false }) { Icon(Icons.Default.Close, "Cerrar filtros") }
                }
                OutlinedTextField(
                    value = placeQuery,
                    onValueChange = { placeQuery = it; timelineAt = null; timelinePlaying = false },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("Buscar ciudad, región o fuente") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    trailingIcon = { if (placeQuery.isNotBlank()) IconButton(onClick = { placeQuery = "" }) { Icon(Icons.Default.Close, "Limpiar búsqueda") } },
                    shape = RoundedCornerShape(14.dp),
                )
                Text("Periodo", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    listOf("Todo", "24 h", "7 días", "30 días").forEach { option ->
                        FilterChip(selected = period == option, onClick = { period = option; timelineAt = null; timelinePlaying = false }, label = { Text(option) })
                    }
                }
                Text("Fuente", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    listOf("Todas", "SGC", "USGS", "EMSC").forEach { source ->
                        FilterChip(selected = selectedSource == source, onClick = { selectedSource = source; timelineAt = null; timelinePlaying = false }, label = { Text(source) })
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Magnitud mínima", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Surface(shape = RoundedCornerShape(9.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                            Text("M ${"%.1f".format(Locale.US, minimumMagnitude)}", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
                        }
                    }
                    Slider(value = minimumMagnitude, onValueChange = { minimumMagnitude = it; timelineAt = null; timelinePlaying = false }, valueRange = 0f..7f, steps = 13)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Cualquier magnitud", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("7.0+", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Surface(shape = RoundedCornerShape(13.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(if (settings.scope == EventScope.LOCATION) Icons.Default.LocationOn else Icons.Default.Public, null, tint = MaterialTheme.colorScheme.primary)
                        Column {
                            Text(if (settings.scope == EventScope.LOCATION) "Cobertura de mi zona" else "Cobertura mundial", fontWeight = FontWeight.SemiBold)
                            Text(if (settings.scope == EventScope.LOCATION) "${settings.location.name} · ${settings.radiusKm} km" else "Se muestran eventos de todas las regiones", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { minimumMagnitude = 0f; selectedSource = "Todas"; placeQuery = ""; period = "Todo"; timelineAt = null; timelinePlaying = false }) {
                        Icon(Icons.Default.RestartAlt, null, Modifier.size(17.dp)); Text("Restablecer")
                    }
                    Text("${visibleEvents.size} eventos", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                }
                Button(onClick = { filtersOpen = false }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) { Text("Mostrar ${visibleEvents.size} sismos") }
            }
        }
    }

    if (timelineOpen) {
        ModalBottomSheet(onDismissRequest = { timelineOpen = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Línea de tiempo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Recorre los sismos en orden cronológico", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { timelineOpen = false }) { Icon(Icons.Default.Close, "Cerrar línea de tiempo") }
                }
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(timelineAt?.let(::formatTimelineTime) ?: "Todos los eventos", color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.SemiBold)
                        Text("${visibleEvents.size} / ${baseEvents.size}", color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.labelLarge)
                    }
                }
                if (timeBounds.second > timeBounds.first) {
                    Slider(
                        value = timelineProgress,
                        onValueChange = { progress -> timelinePlaying = false; timelineAt = timeBounds.first + ((timeBounds.second - timeBounds.first) * progress).toLong() },
                        valueRange = 0f..1f,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatTimelineTime(timeBounds.first), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(formatTimelineTime(timeBounds.second), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    Text("No hay suficientes eventos en este periodo para recorrer la línea de tiempo.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.fillMaxWidth()) {
                    FilledTonalButton(
                        onClick = {
                            if (timelinePlaying) timelinePlaying = false
                            else if (timeBounds.second > timeBounds.first) {
                                if (timelineAt == null || timelineAt!! >= timeBounds.second) timelineAt = timeBounds.first
                                timelinePlaying = true
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = timeBounds.second > timeBounds.first,
                        shape = RoundedCornerShape(13.dp),
                    ) {
                        Icon(if (timelinePlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null)
                        Text(if (timelinePlaying) "Pausar" else "Reproducir", Modifier.padding(start = 6.dp))
                    }
                    OutlinedButton(onClick = { timelinePlaying = false; timelineAt = null }, shape = RoundedCornerShape(13.dp), enabled = timelineAt != null) {
                        Icon(Icons.Default.RestartAlt, null); Text("Todo", Modifier.padding(start = 5.dp))
                    }
                }
                Text("La vista muestra los eventos registrados hasta el momento seleccionado.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = { timelineOpen = false }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) { Text("Listo") }
            }
        }
    }
}

@Composable
private fun MapScopeSegment(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val backgroundColor = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent
    val contentColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier.clip(RoundedCornerShape(11.dp)).background(backgroundColor).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, Modifier.size(17.dp), tint = contentColor)
        Text(label, Modifier.padding(start = 6.dp), color = contentColor, style = MaterialTheme.typography.labelLarge, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun MapToolButton(modifier: Modifier, icon: @Composable () -> Unit, title: String, subtitle: String, selected: Boolean, badge: String?, onClick: () -> Unit) {
    Surface(
        modifier = modifier.heightIn(min = 54.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = if (selected) 0.dp else 1.dp,
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(if (selected) MaterialTheme.colorScheme.surface.copy(alpha = 0.65f) else MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                icon()
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            if (badge != null) Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary) {
                Text(badge, Modifier.padding(horizontal = 6.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun MapLegend(modifier: Modifier = Modifier) {
    Surface(modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f), shadowElevation = 4.dp) {
        Row(Modifier.padding(horizontal = 9.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            LegendItem("1–2.9", Color(0xFF6D9E7B))
            LegendItem("3–4.4", Color(0xFFC7A253))
            LegendItem("4.5+", Color(0xFFC47768))
        }
    }
}

@Composable
private fun SismiMapViewport(
    modifier: Modifier,
    mapView: MapView,
    darkMode: Boolean,
    statusTitle: String,
    statusSubtitle: String,
    onCenter: () -> Unit,
    onWorld: (() -> Unit)? = null,
    onUpdateMarkers: (MapView) -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    LaunchedEffect(mapView, darkMode) {
        val tiles = mapView.overlayManager.tilesOverlay
        tiles.setColorFilter(if (darkMode) DarkMapTileFilter else null)
        tiles.setLoadingBackgroundColor(if (darkMode) AndroidColor.rgb(17, 21, 18) else AndroidColor.rgb(243, 246, 243))
        tiles.setLoadingLineColor(if (darkMode) AndroidColor.rgb(36, 44, 39) else AndroidColor.rgb(224, 231, 226))
        mapView.invalidate()
    }
    Box(modifier.clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape).background(MaterialTheme.colorScheme.surface)) {
        AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize(), update = onUpdateMarkers)
        Surface(
            Modifier.align(Alignment.TopStart).padding(10.dp),
            shape = RoundedCornerShape(11.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
            shadowElevation = 4.dp,
        ) {
            Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(statusTitle, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(statusSubtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }
        }
        Column(Modifier.align(Alignment.TopEnd).padding(9.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(shape = RoundedCornerShape(13.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f), shadowElevation = 4.dp) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(onClick = { mapView.controller.zoomIn() }, modifier = Modifier.size(40.dp)) { Icon(Icons.Default.Add, "Acercar") }
                    HorizontalDivider(Modifier.width(29.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    IconButton(onClick = { mapView.controller.zoomOut() }, modifier = Modifier.size(40.dp)) { Icon(Icons.Default.Remove, "Alejar") }
                }
            }
            Spacer(Modifier.height(7.dp))
            Surface(shape = RoundedCornerShape(13.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f), shadowElevation = 4.dp) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(onClick = onCenter, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Default.LocationOn, "Centrar mapa", tint = MaterialTheme.colorScheme.primary)
                    }
                    if (onWorld != null) {
                        HorizontalDivider(Modifier.width(29.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        IconButton(onClick = onWorld, modifier = Modifier.size(40.dp)) { Icon(Icons.Default.Public, "Vista mundial") }
                    }
                }
            }
        }
        MapLegend(Modifier.align(Alignment.BottomStart).padding(9.dp))
        Surface(
            Modifier.align(Alignment.BottomEnd).padding(9.dp),
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        ) {
            Text("© OpenStreetMap", Modifier.padding(horizontal = 7.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LegendItem(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(7.dp).background(color, CircleShape))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ClusterEventsScreen(events: List<Earthquake>, settings: SismiSettings, onBack: () -> Unit, onOpenEvent: (Earthquake) -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Column { Text("Sismos en esta zona", fontWeight = FontWeight.Bold); Text("${events.size} eventos", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver al mapa") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(events, key = { "${it.source}:${it.id}" }) { event -> EventRow(event, settings, onClick = { onOpenEvent(event) }) }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun EventDetailScreen(event: Earthquake, settings: SismiSettings, onBack: () -> Unit) {
    val context = LocalContext.current
    val detailMap = remember(event.id) {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            setUseDataConnection(true)
            controller.setZoom(7.5)
            controller.setCenter(GeoPoint(event.latitude, event.longitude))
            // El mapa vive dentro de una LazyColumn. Evita que la lista capture
            // el gesto antes de que osmdroid pueda desplazar o hacer zoom.
            setOnTouchListener { view, motionEvent ->
                when (motionEvent.actionMasked) {
                    android.view.MotionEvent.ACTION_DOWN,
                    android.view.MotionEvent.ACTION_MOVE,
                    android.view.MotionEvent.ACTION_POINTER_DOWN -> view.parent?.requestDisallowInterceptTouchEvent(true)
                    android.view.MotionEvent.ACTION_UP,
                    android.view.MotionEvent.ACTION_CANCEL -> view.parent?.requestDisallowInterceptTouchEvent(false)
                }
                false
            }
        }
    }
    DisposableEffect(detailMap) {
        detailMap.onResume()
        onDispose { detailMap.onPause(); detailMap.onDetach() }
    }
    Scaffold(topBar = {
        TopAppBar(
            title = { Column { Text("Información del sismo", fontWeight = FontWeight.Bold); Text(event.source, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
            actions = {
                IconButton(onClick = { shareEarthquake(context, event) }) {
                    Icon(Icons.Default.Share, "Compartir sismo")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
    }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                        MagnitudeBadge(event, Modifier.size(70.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(event.place, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            Text(formatDate(event.timestamp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${event.magnitudeType} · ${event.source}", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Ubicación del epicentro", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        SismiMapViewport(
                            modifier = Modifier.fillMaxWidth().height(320.dp),
                            mapView = detailMap,
                            darkMode = settings.darkMode,
                            statusTitle = "Epicentro · M ${"%.1f".format(Locale.US, event.magnitude)}",
                            statusSubtitle = event.place,
                            onCenter = {
                                detailMap.controller.animateTo(GeoPoint(event.latitude, event.longitude))
                                detailMap.controller.setZoom(7.5)
                            },
                            onWorld = {
                                detailMap.controller.animateTo(GeoPoint(15.0, 0.0))
                                detailMap.controller.setZoom(2.2)
                            },
                            onUpdateMarkers = { view ->
                                view.overlays.removeAll { it is Marker }
                                view.overlays.add(Marker(view).apply {
                                    position = GeoPoint(event.latitude, event.longitude)
                                    title = "M ${"%.1f".format(Locale.US, event.magnitude)} · ${event.place}"
                                    snippet = "${"%.4f".format(Locale.US, event.latitude)}, ${"%.4f".format(Locale.US, event.longitude)}"
                                    icon = clusterMarkerDrawable(context, 1, event.magnitude)
                                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                                })
                                view.invalidate()
                            },
                        )
                        Text("${"%.4f".format(Locale.US, event.latitude)}, ${"%.4f".format(Locale.US, event.longitude)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Datos del evento", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        DetailField("Magnitud", "${event.magnitudeType} ${"%.1f".format(Locale.US, event.magnitude)}")
                        DetailField("Profundidad", event.depthKm?.let { "${it.toInt()} km" } ?: "No disponible")
                        DetailField("Distancia a ${settings.location.name}", "${distanceKm(settings.location.latitude, settings.location.longitude, event).toInt()} km")
                        DetailField("Hora local", formatDate(event.timestamp))
                        DetailField("Fuente", event.agency)
                        event.status?.let { DetailField("Estado", it) }
                        event.felt?.let { DetailField("Reportes sentidos", it.toString()) }
                        event.intensity?.let { DetailField("Intensidad máxima", "MMI ${"%.1f".format(Locale.US, it)}") }
                        event.significance?.let { DetailField("Significancia", it.toString()) }
                        if (event.tsunami) DetailField("Aviso de tsunami", "Revisar indicaciones oficiales")
                    }
                }
            }
            item { Text("Los datos pueden actualizarse después de su primera publicación. Consulta las indicaciones de las autoridades locales.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun DetailField(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

private fun clusterEventsForViewport(events: List<Earthquake>, mapView: MapView, fallbackCellDegrees: Double): List<EventCluster> {
    if (mapView.width <= 0 || mapView.height <= 0) return clusterEventsByGrid(events, fallbackCellDegrees)

    val density = mapView.resources.displayMetrics.density
    val mergeDistancePx = 58f * density
    val mergeDistanceSquared = mergeDistancePx * mergeDistancePx
    val projection = mapView.projection
    val positionedEvents = events
        .sortedByDescending(Earthquake::magnitude)
        .map { event -> event to projection.toPixels(GeoPoint(event.latitude, event.longitude), Point()) }
    val groups = mutableListOf<MutableList<Pair<Earthquake, Point>>>()

    positionedEvents.forEach { positioned ->
        val (event, point) = positioned
        val nearest = groups.minByOrNull { group ->
            val centerX = group.sumOf { it.second.x } / group.size
            val centerY = group.sumOf { it.second.y } / group.size
            val dx = (point.x - centerX).toFloat()
            val dy = (point.y - centerY).toFloat()
            dx * dx + dy * dy
        }
        if (nearest == null) {
            groups += mutableListOf(positioned)
        } else {
            val centerX = nearest.sumOf { it.second.x } / nearest.size
            val centerY = nearest.sumOf { it.second.y } / nearest.size
            val dx = (point.x - centerX).toFloat()
            val dy = (point.y - centerY).toFloat()
            if (dx * dx + dy * dy <= mergeDistanceSquared) nearest += positioned
            else groups += mutableListOf(positioned)
        }
    }

    return groups.map { group ->
        val strongest = group.maxBy { it.first.magnitude }.first
        EventCluster(
            latitude = group.map { it.first.latitude }.average(),
            longitude = group.map { it.first.longitude }.average(),
            events = group.map { it.first }.sortedByDescending(Earthquake::timestamp),
        ).let { cluster ->
            if (group.size == 1) cluster.copy(latitude = strongest.latitude, longitude = strongest.longitude) else cluster
        }
    }
}

private fun clusterEventsByGrid(events: List<Earthquake>, cellDegrees: Double): List<EventCluster> = events
    .groupBy { event ->
        val latCell = kotlin.math.floor((event.latitude + 90) / cellDegrees).toInt()
        val lonCell = kotlin.math.floor((event.longitude + 180) / cellDegrees).toInt()
        "$latCell:$lonCell"
    }
    .values
    .map { group ->
        val strongest = group.maxBy(Earthquake::magnitude)
        EventCluster(
            latitude = if (group.size == 1) strongest.latitude else group.map(Earthquake::latitude).average(),
            longitude = if (group.size == 1) strongest.longitude else group.map(Earthquake::longitude).average(),
            events = group.sortedByDescending(Earthquake::timestamp),
        )
    }

private fun clusterMarkerDrawable(context: android.content.Context, count: Int, magnitude: Double): BitmapDrawable {
    val density = context.resources.displayMetrics.density
    val size = (34 * density).toInt()
    val text = TextView(context).apply {
        this.text = if (count > 1) count.toString() else "%.1f".format(Locale.US, magnitude)
        setTextColor(AndroidColor.WHITE)
        textSize = 10f
        typeface = Typeface.DEFAULT_BOLD
        gravity = android.view.Gravity.CENTER
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(
                when {
                    magnitude >= 5.5 -> AndroidColor.rgb(200, 92, 92)
                    magnitude >= 4.5 -> AndroidColor.rgb(213, 124, 74)
                    magnitude >= 3.0 -> AndroidColor.rgb(199, 162, 83)
                    else -> AndroidColor.rgb(95, 159, 123)
                },
            )
            setStroke((2 * density).toInt(), AndroidColor.WHITE)
        }
    }
    text.measure(
        android.view.View.MeasureSpec.makeMeasureSpec(size, android.view.View.MeasureSpec.EXACTLY),
        android.view.View.MeasureSpec.makeMeasureSpec(size, android.view.View.MeasureSpec.EXACTLY),
    )
    text.layout(0, 0, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    text.draw(Canvas(bitmap))
    return BitmapDrawable(context.resources, bitmap)
}

private fun formatTimelineTime(timestamp: Long): String = java.time.format.DateTimeFormatter
    .ofPattern("d MMM · h:mm a", Locale.forLanguageTag("es-CO"))
    .withZone(SismiTime.zone)
    .format(java.time.Instant.ofEpochMilli(timestamp)).lowercase(Locale.forLanguageTag("es-CO"))

private fun formatDate(timestamp: Long): String = java.time.format.DateTimeFormatter
    .ofPattern("d MMM yyyy · h:mm a", Locale.forLanguageTag("es-CO"))
    .withZone(SismiTime.zone)
    .format(java.time.Instant.ofEpochMilli(timestamp)).lowercase(Locale.forLanguageTag("es-CO"))

private fun shareEarthquake(context: android.content.Context, event: Earthquake) {
    val details = buildString {
        append("Sismo M ${"%.1f".format(Locale.US, event.magnitude)}\n")
        append("${event.place}\n")
        append("${formatDate(event.timestamp)} · ${event.source}\n")
        event.depthKm?.let { append("Profundidad: ${it.toInt()} km\n") }
        append("Coordenadas: ${"%.4f".format(Locale.US, event.latitude)}, ${"%.4f".format(Locale.US, event.longitude)}")
        event.eventUrl?.let { append("\n\nMás información: $it") }
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Sismo M ${"%.1f".format(Locale.US, event.magnitude)} · ${event.place}")
        putExtra(Intent.EXTRA_TEXT, details)
    }
    runCatching { context.startActivity(Intent.createChooser(intent, "Compartir sismo")) }
}
