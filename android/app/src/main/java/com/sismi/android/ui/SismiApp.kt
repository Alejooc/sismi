package com.sismi.android.ui

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.sismi.android.notifications.SismiNotifications
import kotlinx.coroutines.launch

@Composable
fun SismiApp(
    model: SismiViewModel = viewModel(),
    openEventId: String? = null,
    onEventOpened: () -> Unit = {},
) {
    val state by model.state.collectAsState()
    val navController = rememberNavController()
    val lifecycleOwner = LocalLifecycleOwner.current
    val view = LocalView.current
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val permissionPreferences = remember(context) {
        context.getSharedPreferences(PERMISSION_SETUP_PREFERENCES, Context.MODE_PRIVATE)
    }
    var showPermissionSetup by remember { mutableStateOf(false) }
    var permissionStateVersion by remember { mutableStateOf(0) }

    val locationPermissionGranted = remember(context, permissionStateVersion) { hasLocationPermission(context) }
    val notificationRuntimePermissionGranted = remember(context, permissionStateVersion) { hasNotificationRuntimePermission(context) }
    val systemNotificationsEnabled = notificationRuntimePermissionGranted &&
        remember(context, permissionStateVersion) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    val alertSoundChannelReady = remember(context, permissionStateVersion) { isAlertSoundChannelReady(context) }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionStateVersion++
        if (!granted) {
            finishPermissionSetup(context, permissionPreferences, model, false)
            showPermissionSetup = false
        } else if (NotificationManagerCompat.from(context).areNotificationsEnabled() && isAlertSoundChannelReady(context)) {
            finishPermissionSetup(context, permissionPreferences, model, true)
            showPermissionSetup = false
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        permissionStateVersion++
        val granted = grants.values.any { it }
        if (granted && state.settings.location.name == "Bogotá" && state.settings.location.region == "Bogotá D.C.") {
            coroutineScope.launch { model.useCurrentLocation(context) }
        }
        if (!hasNotificationRuntimePermission(context)) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else if (NotificationManagerCompat.from(context).areNotificationsEnabled() && isAlertSoundChannelReady(context)) {
            finishPermissionSetup(context, permissionPreferences, model, true)
            showPermissionSetup = false
        }
    }

    LaunchedEffect(locationPermissionGranted, notificationRuntimePermissionGranted, systemNotificationsEnabled, alertSoundChannelReady) {
        if (!permissionPreferences.getBoolean(PERMISSION_SETUP_COMPLETED, false)) {
            if (!locationPermissionGranted || !notificationRuntimePermissionGranted || !systemNotificationsEnabled || !alertSoundChannelReady) {
                showPermissionSetup = true
            } else {
                finishPermissionSetup(context, permissionPreferences, model, true)
            }
        }
    }

    LaunchedEffect(systemNotificationsEnabled) {
        if (systemNotificationsEnabled) model.ensureAutomaticRemoteAlerts()
    }

    SideEffect {
        val window = (view.context as? Activity)?.window
        if (window != null) {
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !state.settings.darkMode
                isAppearanceLightNavigationBars = !state.settings.darkMode
            }
        }
    }

    DisposableEffect(lifecycleOwner, model) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> model.startMonitoring()
                Lifecycle.Event.ON_STOP -> model.stopMonitoring()
                Lifecycle.Event.ON_RESUME -> permissionStateVersion++
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        model.startMonitoring()
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            model.stopMonitoring()
        }
    }

    LaunchedEffect(openEventId, state.events, state.refreshing, state.lastSyncAt) {
        if (openEventId.isNullOrBlank()) return@LaunchedEffect
        val event = state.events.firstOrNull { it.id == openEventId }
        if (event != null) {
            model.selectEvent(event)
            navController.navigate("detail") { launchSingleTop = true }
            onEventOpened()
        } else if (!state.refreshing && state.lastSyncAt != null) {
            onEventOpened()
        }
    }

    SismiTheme(darkMode = state.settings.darkMode) {
        NavHost(navController = navController, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    state = state,
                    model = model,
                    onOpenSettings = { navController.navigate("settings") },
                    onOpenSafety = { navController.navigate("safety") },
                    onOpenAbout = { navController.navigate("about") },
                    onOpenEvent = { event ->
                        model.selectEvent(event)
                        navController.navigate("detail")
                    },
                    onOpenCluster = { events ->
                        model.selectCluster(events)
                        navController.navigate("cluster")
                    },
                )
            }
            composable("settings") {
                SettingsScreen(state, model, onBack = { navController.popBackStack() })
            }
            composable("safety") {
                SafetyScreen(onBack = { navController.popBackStack() })
            }
            composable("about") {
                AboutScreen(onBack = { navController.popBackStack() })
            }
            composable("detail") {
                state.selectedEvent?.let { event ->
                    EventDetailScreen(event, state.settings, onBack = { navController.popBackStack() })
                } ?: androidx.compose.material3.Text("Selecciona un sismo para ver sus detalles.")
            }
            composable("cluster") {
                ClusterEventsScreen(
                    events = state.selectedCluster,
                    settings = state.settings,
                    onBack = { navController.popBackStack() },
                    onOpenEvent = { event ->
                        model.selectEvent(event)
                        navController.navigate("detail")
                    },
                )
            }
        }

        if (showPermissionSetup) {
            PermissionSetupDialog(
                locationGranted = locationPermissionGranted,
                notificationsGranted = systemNotificationsEnabled,
                soundChannelReady = alertSoundChannelReady,
                onContinue = {
                    when {
                        !locationPermissionGranted -> locationPermissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
                        )
                        !notificationRuntimePermissionGranted -> notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        !systemNotificationsEnabled -> {
                            openNotificationSettings(context)
                            finishPermissionSetup(context, permissionPreferences, model, false)
                            showPermissionSetup = false
                        }
                        !alertSoundChannelReady -> {
                            openAlertSoundSettings(context)
                        }
                        else -> {
                            finishPermissionSetup(context, permissionPreferences, model, true)
                            showPermissionSetup = false
                        }
                    }
                },
                onDismiss = {
                    finishPermissionSetup(context, permissionPreferences, model, false)
                    showPermissionSetup = false
                },
                onOpenSoundSettings = { openAlertSoundSettings(context) },
            )
        }
    }
}

@Composable
private fun PermissionSetupDialog(
    locationGranted: Boolean,
    notificationsGranted: Boolean,
    soundChannelReady: Boolean,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
    onOpenSoundSettings: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = CircleShape) {
                Icon(
                    Icons.Default.Notifications,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(10.dp).size(24.dp),
                )
            }
        },
        title = { Text("Prepara tus alertas", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Sismi necesita estos permisos para ubicar los sismos cercanos y avisarte a tiempo.")
                PermissionSetupRow(
                    icon = Icons.Default.LocationOn,
                    title = "Ubicación",
                    description = "Para calcular qué sismos están cerca de ti. Puedes seguir usando una ciudad elegida manualmente.",
                    status = if (locationGranted) "Permitida" else "Por permitir",
                    ready = locationGranted,
                )
                PermissionSetupRow(
                    icon = Icons.Default.Notifications,
                    title = "Notificaciones",
                    description = "Necesarias para mostrar los avisos de Sismi.",
                    status = if (notificationsGranted) "Permitidas" else "Por permitir",
                    ready = notificationsGranted,
                )
                PermissionSetupRow(
                    icon = Icons.AutoMirrored.Filled.VolumeUp,
                    title = "Sonido",
                    description = "No tiene un permiso aparte: Android controla el canal y el volumen de las alertas.",
                    status = if (soundChannelReady) "Canal listo" else "Revisar",
                    ready = soundChannelReady,
                )
                if (!soundChannelReady) {
                    TextButton(onClick = onOpenSoundSettings) {
                        Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Ajustar sonido en Android")
                    }
                }
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(9.dp))
                        Column {
                            Text("Sobre el segundo plano", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Esta versión pausa la búsqueda al salir de la app. Un permiso de ubicación no la mantiene activa; las alertas con Sismi cerrada todavía requieren una función de avisos remotos.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onContinue) {
                Text(
                    when {
                        !locationGranted || !notificationsGranted -> "Continuar"
                        !soundChannelReady -> "Revisar sonido"
                        else -> "Listo"
                    },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Ahora no") }
        },
    )
}

@Composable
private fun PermissionSetupRow(
    icon: ImageVector,
    title: String,
    description: String,
    status: String,
    ready: Boolean,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(10.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.padding(9.dp).size(20.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        Text(
            status,
            style = MaterialTheme.typography.labelSmall,
            color = if (ready) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

private fun hasNotificationRuntimePermission(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

private fun isAlertSoundChannelReady(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val channel = context.getSystemService(NotificationManager::class.java)
        .getNotificationChannel(SismiNotifications.ALERT_CHANNEL_SOUND)
    return channel != null && channel.importance != NotificationManager.IMPORTANCE_NONE && channel.sound != null
}

private fun finishPermissionSetup(
    context: Context,
    preferences: android.content.SharedPreferences,
    model: SismiViewModel,
    enableAlerts: Boolean,
) {
    preferences.edit().putBoolean(PERMISSION_SETUP_COMPLETED, true).apply()
    if (enableAlerts && hasNotificationRuntimePermission(context) && NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        model.updateSettings { it.copy(alertsEnabled = true) }
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    runCatching { context.startActivity(intent) }
}

private fun openAlertSoundSettings(context: Context) {
    val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        putExtra(Settings.EXTRA_CHANNEL_ID, SismiNotifications.ALERT_CHANNEL_SOUND)
    }
    runCatching { context.startActivity(intent) }
}

private const val PERMISSION_SETUP_PREFERENCES = "sismi_permission_setup"
private const val PERMISSION_SETUP_COMPLETED = "completed_v1"
