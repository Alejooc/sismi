package com.sismi.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LocationRepository {
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    suspend fun search(query: String): List<SavedLocation> = withContext(Dispatchers.IO) {
        val normalized = query.trim()
        if (normalized.length < 2) return@withContext emptyList()
        val encoded = java.net.URLEncoder.encode(normalized, Charsets.UTF_8.name())
        val request = Request.Builder()
            .url("https://geocoding-api.open-meteo.com/v1/search?name=$encoded&count=8&language=es&format=json")
            .header("Accept", "application/json")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("No fue posible buscar lugares")
            val results = JSONObject(response.body?.string().orEmpty()).optJSONArray("results")
                ?: return@withContext emptyList()
            buildList {
                for (index in 0 until results.length()) {
                    val place = results.optJSONObject(index) ?: continue
                    val latitude = place.optDouble("latitude", Double.NaN)
                    val longitude = place.optDouble("longitude", Double.NaN)
                    if (!latitude.isFinite() || !longitude.isFinite()) continue
                    add(
                        SavedLocation(
                            name = place.optString("name"),
                            region = place.optString("admin1", place.optString("admin2")),
                            country = place.optString("country", place.optString("country_code")),
                            latitude = latitude,
                            longitude = longitude,
                        ),
                    )
                }
            }
        }
    }
}
