package com.sismi.android.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.google.firebase.installations.FirebaseInstallations
import com.sismi.android.data.Earthquake
import com.sismi.android.data.EventScope
import com.sismi.android.data.SismiStore
import com.sismi.android.data.distanceKm
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class SismiFirebaseMessagingService : FirebaseMessagingService() {
    @Suppress("DEPRECATION")
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val settings = SismiStore(applicationContext).loadSettings()
            val firebaseInstallationId = runCatching { FirebaseInstallations.getInstance().id.await() }.getOrNull() ?: return@launch
            runCatching { RemoteAlertsClient(applicationContext).syncRefreshedToken(firebaseInstallationId, token, settings) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        when (data["type"]) {
            "earthquake" -> {
                val event = data.toEarthquake() ?: return
                val settings = SismiStore(applicationContext).loadSettings()
                val distance = if (settings.scope == EventScope.LOCATION) {
                    distanceKm(settings.location.latitude, settings.location.longitude, event)
                } else null
                SismiNotifications(applicationContext).notifyEarthquake(event, distance, data["sound"] == "true" && settings.alertSound)
            }
            "test" -> {
                val settings = SismiStore(applicationContext).loadSettings()
                SismiNotifications(applicationContext).test(data["sound"] == "true" && settings.alertSound)
            }
        }
    }

    private fun Map<String, String>.toEarthquake(): Earthquake? {
        val id = this["eventId"] ?: return null
        val magnitude = this["magnitude"]?.toDoubleOrNull() ?: return null
        val latitude = this["latitude"]?.toDoubleOrNull() ?: return null
        val longitude = this["longitude"]?.toDoubleOrNull() ?: return null
        val timestamp = this["timestamp"]?.toLongOrNull() ?: return null
        return Earthquake(
            id = id,
            place = this["place"] ?: "Ubicación no disponible",
            magnitude = magnitude,
            magnitudeType = this["magnitudeType"] ?: "M",
            depthKm = this["depthKm"]?.toDoubleOrNull(),
            timestamp = timestamp,
            source = this["source"] ?: "—",
            latitude = latitude,
            longitude = longitude,
            agency = this["agency"] ?: this["source"] ?: "—",
            eventUrl = this["eventUrl"]?.takeIf(String::isNotBlank),
        )
    }
}
