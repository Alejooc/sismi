package com.sismi.android.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.util.UUID

class SismiStore(context: Context) {
    private val preferences = context.getSharedPreferences("sismi-android", Context.MODE_PRIVATE)
    private val cacheFile = File(context.filesDir, "earthquake-cache.json")
    private val gson = Gson()

    fun loadSettings(): SismiSettings = SismiSettings(
        location = SavedLocation(
            name = preferences.getString("location_name", "Bogotá") ?: "Bogotá",
            region = preferences.getString("location_region", "Bogotá D.C.") ?: "Bogotá D.C.",
            country = preferences.getString("location_country", "Colombia") ?: "Colombia",
            latitude = preferences.getFloat("location_lat", 4.711f).toDouble(),
            longitude = preferences.getFloat("location_lon", -74.0721f).toDouble(),
        ),
        radiusKm = preferences.getInt("radius_km", 250),
        scope = runCatching { EventScope.valueOf(preferences.getString("scope", "LOCATION") ?: "LOCATION") }.getOrDefault(EventScope.LOCATION),
        minimumMagnitude = preferences.getFloat("minimum_magnitude", 3f),
        source = preferences.getString("source", "Todas") ?: "Todas",
        alertsEnabled = preferences.getBoolean("alerts_enabled", false),
        alertSound = preferences.getBoolean("alert_sound", true),
        maxAlertsPerUpdate = preferences.getInt("max_alerts_per_update", 3).coerceIn(1, 10),
        darkMode = preferences.getBoolean("dark_mode", false),
        doNotDisturb = preferences.getBoolean("do_not_disturb", false),
        quietHours = preferences.getBoolean("quiet_hours", false),
        quietHoursStart = preferences.getString("quiet_hours_start", "22:00") ?: "22:00",
        quietHoursEnd = preferences.getString("quiet_hours_end", "07:00") ?: "07:00",
        remoteAlertsEnabled = preferences.getBoolean("remote_alerts_enabled", false),
        remoteServerUrl = preferences.getString("remote_server_url", "") ?: "",
    )

    fun saveSettings(settings: SismiSettings) {
        preferences.edit()
            .putString("location_name", settings.location.name)
            .putString("location_region", settings.location.region)
            .putString("location_country", settings.location.country)
            .putFloat("location_lat", settings.location.latitude.toFloat())
            .putFloat("location_lon", settings.location.longitude.toFloat())
            .putInt("radius_km", settings.radiusKm)
            .putString("scope", settings.scope.name)
            .putFloat("minimum_magnitude", settings.minimumMagnitude)
            .putString("source", settings.source)
            .putBoolean("alerts_enabled", settings.alertsEnabled)
            .putBoolean("alert_sound", settings.alertSound)
            .putInt("max_alerts_per_update", settings.maxAlertsPerUpdate)
            .putBoolean("dark_mode", settings.darkMode)
            .putBoolean("do_not_disturb", settings.doNotDisturb)
            .putBoolean("quiet_hours", settings.quietHours)
            .putString("quiet_hours_start", settings.quietHoursStart)
            .putString("quiet_hours_end", settings.quietHoursEnd)
            .putBoolean("remote_alerts_enabled", settings.remoteAlertsEnabled)
            .putString("remote_server_url", settings.remoteServerUrl)
            .apply()
    }

    fun loadAlertedEventKeys(): MutableSet<String> = preferences
        .getStringSet("alerted_event_keys", emptySet())
        .orEmpty()
        .toMutableSet()

    fun saveAlertedEventKeys(keys: Set<String>) {
        preferences.edit()
            .putStringSet("alerted_event_keys", keys.toList().takeLast(600).toSet())
            .apply()
    }

    fun remoteInstallationId(): String = preferences.getString("remote_installation_id", null)
        ?: UUID.randomUUID().toString().also { preferences.edit().putString("remote_installation_id", it).apply() }

    fun loadEvents(): List<Earthquake> = runCatching {
        val type = object : TypeToken<List<Earthquake>>() {}.type
        gson.fromJson<List<Earthquake>>(cacheFile.readText(), type).orEmpty()
    }.getOrDefault(emptyList())

    fun saveEvents(events: List<Earthquake>) {
        runCatching { cacheFile.writeText(gson.toJson(events.take(1200))) }
    }
}
