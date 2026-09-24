package com.sismi.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class EarthquakeRepository {
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .callTimeout(16, TimeUnit.SECONDS)
        .build()

    suspend fun refresh(): RefreshResult = withContext(Dispatchers.IO) {
        coroutineScope {
            val usgs = async { runCatching { fetchUsgs() } }
            val sgc = async { runCatching { fetchSgc() } }
            val checkedAt = System.currentTimeMillis()
            val usgsResult = usgs.await()
            val sgcResult = sgc.await()
            val sources = listOf(
                FeedStatus("USGS", usgsResult.getOrNull()?.size ?: 0, usgsResult.exceptionOrNull()?.message, checkedAt),
                FeedStatus("SGC", sgcResult.getOrNull()?.size ?: 0, sgcResult.exceptionOrNull()?.message, checkedAt),
            )
            val events = deduplicateEvents(usgsResult.getOrDefault(emptyList()) + sgcResult.getOrDefault(emptyList()))
            if (events.isEmpty() && sources.all { !it.isAvailable }) {
                throw IllegalStateException("No se pudo conectar con SGC ni USGS")
            }
            RefreshResult(events, sources)
        }
    }

    fun subscribeEmscRealtime(
        onStatus: (Boolean, String?) -> Unit,
        onEvent: (Earthquake) -> Unit,
    ): WebSocket {
        val request = Request.Builder()
            .url("wss://www.seismicportal.eu/standing_order/websocket")
            .build()
        return client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                onStatus(true, null)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { normalizeEmsc(JSONObject(text)) }.getOrNull()?.let(onEvent)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = Unit

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                onStatus(false, t.message ?: "EMSC no respondió")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onStatus(false, "Conexión EMSC cerrada")
            }
        })
    }

    private fun fetchUsgs(): List<Earthquake> {
        val url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
        val json = getJson(url)
        val features = json.optJSONArray("features") ?: JSONArray()
        return buildList {
            for (index in 0 until features.length()) {
                normalizeGeoJson(features.optJSONObject(index), "USGS")?.let(::add)
            }
        }
    }

    private suspend fun fetchSgc(): List<Earthquake> {
        return withContext(Dispatchers.IO) {
            val payload = getJson(SGC_ARCHIVE_FEED_URL)
            val features = payload.optJSONArray("features") ?: JSONArray()
            buildList {
                for (index in 0 until features.length()) {
                    normalizeSgcOfficialGeoJson(features.optJSONObject(index))?.let(::add)
                }
            }
        }
    }

    private fun getJson(url: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/geo+json, application/json, text/plain, */*")
            .header("Referer", "https://www.sgc.gov.co/sismos")
            .header("Origin", "https://www.sgc.gov.co")
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36")
            .build()
        return client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Respuesta HTTP ${response.code}")
            JSONObject(response.body?.string() ?: error("Respuesta vacía"))
        }
    }

    private fun normalizeGeoJson(feature: JSONObject?, defaultSource: String): Earthquake? {
        feature ?: return null
        val coordinates = feature.optJSONObject("geometry")?.optJSONArray("coordinates") ?: return null
        if (coordinates.length() < 2) return null
        val longitude = coordinates.optDouble(0, Double.NaN)
        val latitude = coordinates.optDouble(1, Double.NaN)
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        val properties = feature.optJSONObject("properties") ?: JSONObject()
        val source = if (defaultSource == "SGC") "SGC" else "USGS"
        val timestamp = eventTimestamp(properties, source) ?: return null
        val eventId = feature.optString("id", properties.optString("code", "${source}-${timestamp}"))
        val depth = coordinates.optDouble(2, Double.NaN).takeIf(Double::isFinite)
        val magnitude = properties.optDouble("mag", 0.0)
        return Earthquake(
            id = eventId,
            place = properties.optString("place", "Ubicación no disponible"),
            magnitude = magnitude,
            magnitudeType = properties.optString("magType", "M").uppercase(),
            depthKm = depth,
            timestamp = timestamp,
            updatedAt = parseTimestamp(properties.opt("updated")),
            source = source,
            latitude = latitude,
            longitude = longitude,
            agency = properties.optString("net", source),
            status = properties.optString("status").takeIf(String::isNotBlank),
            felt = properties.optInt("felt", -1).takeIf { it >= 0 },
            intensity = properties.optDouble("mmi", Double.NaN).takeIf(Double::isFinite),
            significance = properties.optInt("sig", -1).takeIf { it >= 0 },
            tsunami = properties.optInt("tsunami", 0) == 1,
            eventUrl = properties.optString("url").takeIf(String::isNotBlank),
        )
    }

    private fun normalizeSgcOfficialGeoJson(feature: JSONObject?): Earthquake? {
        feature ?: return null
        val coordinates = feature.optJSONObject("geometry")?.optJSONArray("coordinates") ?: return null
        if (coordinates.length() < 2) return null
        // El feed archive del SGC publica [latitud, longitud, profundidad].
        val latitude = coordinates.optDouble(0, Double.NaN)
        val longitude = coordinates.optDouble(1, Double.NaN)
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        val properties = feature.optJSONObject("properties") ?: JSONObject()
        val timestamp = eventTimestamp(properties, "SGC") ?: return null
        val id = feature.optString("id", properties.optString("id", "SGC-$timestamp"))
        return Earthquake(
            id = id,
            place = properties.optString("place", "Ubicación no disponible"),
            magnitude = properties.number("mag") ?: properties.number("magnitude") ?: 0.0,
            magnitudeType = properties.optString("magType", properties.optString("mag_type", "ML")).substringBefore('_').uppercase(),
            depthKm = properties.number("depth") ?: coordinates.optDouble(2, Double.NaN).takeIf(Double::isFinite),
            timestamp = timestamp,
            source = "SGC",
            latitude = latitude,
            longitude = longitude,
            agency = properties.optString("agency", "SGC"),
            status = properties.optString("status", properties.optString("event_type")).takeIf(String::isNotBlank),
            felt = properties.optInt("felt", properties.optInt("felt_report_records", -1)).takeIf { it >= 0 },
            intensity = properties.number("mmi"),
            eventUrl = "https://www.sgc.gov.co/detallesismo/$id/resumen",
        )
    }

    private fun normalizeEmsc(message: JSONObject): Earthquake? {
        if (message.optString("action").equals("delete", ignoreCase = true)) return null
        val properties = message.optJSONObject("data")?.optJSONObject("properties") ?: return null
        val latitude = properties.number("lat") ?: return null
        val longitude = properties.number("lon") ?: return null
        val magnitude = properties.number("mag") ?: return null
        val timestamp = parseTimestamp(properties.opt("time")) ?: return null
        val id = properties.optString("unid", properties.optString("source_id", "EMSC-$timestamp"))
        return Earthquake(
            id = id,
            place = properties.optString("flynn_region", properties.optString("region", "Ubicación no disponible")),
            magnitude = magnitude,
            magnitudeType = properties.optString("magtype", "M").uppercase(),
            depthKm = properties.number("depth"),
            timestamp = timestamp,
            updatedAt = parseTimestamp(properties.opt("lastupdate")),
            source = "EMSC",
            latitude = latitude,
            longitude = longitude,
            agency = properties.optString("auth", "EMSC"),
            status = "Detección rápida",
            eventUrl = properties.optString("source_id").takeIf(String::isNotBlank)?.let { "https://www.emsc-csem.org/Earthquake/earthquake.php?id=$it" },
        )
    }

    private fun JSONObject.number(key: String): Double? {
        val value = opt(key)
        val number = when (value) {
            is Number -> value.toDouble()
            is String -> value.toDoubleOrNull()
            else -> null
        }
        return number?.takeIf(Double::isFinite)
    }

    private fun eventTimestamp(properties: JSONObject, source: String): Long? {
        if (source == "SGC") {
            listOf("utcTime", "utc_time", "time", "updated").forEach { key ->
                parseSgcTimestamp(properties.optString(key)).let { parsed ->
                    if (parsed != null) return parsed
                }
            }
        }
        return parseTimestamp(properties.opt("time"))
            ?: parseTimestamp(properties.opt("updated"))
    }

    private fun parseSgcTimestamp(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        var normalized = value.trim().replace(' ', 'T')
        // El SGC publica utcTime como yyyy-MM-dd HH:mm, sin segundos.
        // Instant.parse exige segundos cuando la hora está expresada así.
        if (Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$").matches(normalized)) {
            normalized += ":00"
        }
        val hasZone = normalized.endsWith('Z') || Regex("[+-]\\d{2}:?\\d{2}$").containsMatchIn(normalized)
        val withZone = if (hasZone) normalized else "${normalized}Z"
        return runCatching { java.time.Instant.parse(withZone).toEpochMilli() }.getOrNull()
    }

    private fun parseTimestamp(value: Any?): Long? = when (value) {
        is Number -> value.toLong().let { if (it < 10_000_000_000L) it * 1000L else it }
        is String -> value.toLongOrNull()?.let { if (it < 10_000_000_000L) it * 1000L else it }
            ?: runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrNull()
        else -> null
    }

    private companion object {
        const val SGC_ARCHIVE_FEED_URL = "https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json"
    }
}
