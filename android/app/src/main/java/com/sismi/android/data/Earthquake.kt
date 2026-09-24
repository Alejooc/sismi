package com.sismi.android.data

data class Earthquake(
    val id: String,
    val place: String,
    val magnitude: Double,
    val magnitudeType: String,
    val depthKm: Double?,
    val timestamp: Long,
    val updatedAt: Long? = null,
    val source: String,
    val latitude: Double,
    val longitude: Double,
    val agency: String = source,
    val status: String? = null,
    val felt: Int? = null,
    val intensity: Double? = null,
    val significance: Int? = null,
    val tsunami: Boolean = false,
    val eventUrl: String? = null,
)

data class FeedStatus(
    val source: String,
    val count: Int = 0,
    val error: String? = null,
    val checkedAt: Long = System.currentTimeMillis(),
) {
    val isAvailable: Boolean get() = error == null
}

data class RefreshResult(
    val events: List<Earthquake>,
    val sources: List<FeedStatus>,
)

data class SavedLocation(
    val name: String,
    val region: String,
    val country: String,
    val latitude: Double,
    val longitude: Double,
) {
    val label: String get() = listOf(name, region, country).filter(String::isNotBlank).distinct().joinToString(", ")
}

enum class EventScope { LOCATION, GLOBAL }

data class SismiSettings(
    val location: SavedLocation = SavedLocation("Bogotá", "Bogotá D.C.", "Colombia", 4.711, -74.0721),
    val radiusKm: Int = 250,
    val scope: EventScope = EventScope.LOCATION,
    val minimumMagnitude: Float = 3f,
    val source: String = "Todas",
    val alertsEnabled: Boolean = false,
    val alertSound: Boolean = true,
    val maxAlertsPerUpdate: Int = 3,
    val darkMode: Boolean = false,
    val doNotDisturb: Boolean = false,
    val quietHours: Boolean = false,
    val quietHoursStart: String = "22:00",
    val quietHoursEnd: String = "07:00",
    val remoteAlertsEnabled: Boolean = false,
    val remoteServerUrl: String = "",
)

fun distanceKm(latitude: Double, longitude: Double, event: Earthquake): Double {
    val earthRadiusKm = 6371.0
    val lat1 = Math.toRadians(latitude)
    val lat2 = Math.toRadians(event.latitude)
    val deltaLat = Math.toRadians(event.latitude - latitude)
    val deltaLon = Math.toRadians(event.longitude - longitude)
    val haversine = kotlin.math.sin(deltaLat / 2).let { it * it } +
        kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * kotlin.math.sin(deltaLon / 2).let { it * it }
    return 2 * earthRadiusKm * kotlin.math.asin(kotlin.math.sqrt(haversine.coerceIn(0.0, 1.0)))
}

fun deduplicateEvents(events: List<Earthquake>): List<Earthquake> {
    val ordered = events.sortedByDescending(Earthquake::timestamp)
    val unique = mutableListOf<Earthquake>()
    for (event in ordered) {
        val duplicateIndex = unique.indexOfFirst { existing ->
            existing.source != event.source &&
                kotlin.math.abs(existing.timestamp - event.timestamp) <= 2 * 60 * 1000 &&
                distanceKm(existing.latitude, existing.longitude, event) <= 35 &&
                kotlin.math.abs(existing.magnitude - event.magnitude) <= 0.4
        }
        if (duplicateIndex < 0) unique += event
        else if (event.source == "SGC") unique[duplicateIndex] = event
    }
    return unique.sortedByDescending(Earthquake::timestamp)
}
