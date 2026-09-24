package com.sismi.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EarthquakeTest {
    @Test
    fun distanceUsesGreatCircleDistance() {
        val event = quake("USGS", "one", 0.0, 1.0)

        assertEquals(111.2, distanceKm(0.0, 0.0, event), 0.7)
    }

    @Test
    fun matchingNetworkReportsPreferSgc() {
        val timestamp = 1_700_000_000_000L
        val usgs = quake("USGS", "usgs-1", 4.7, -74.0, timestamp, 3.2)
        val sgc = quake("SGC", "sgc-1", 4.71, -74.01, timestamp + 35_000, 3.3)

        val result = deduplicateEvents(listOf(usgs, sgc))

        assertEquals(1, result.size)
        assertEquals("SGC", result.single().source)
    }

    @Test
    fun distantEventsAreNotMerged() {
        val timestamp = 1_700_000_000_000L
        val first = quake("USGS", "usgs-1", 4.7, -74.0, timestamp, 3.2)
        val second = quake("SGC", "sgc-1", -34.0, -58.0, timestamp + 10_000, 3.2)

        val result = deduplicateEvents(listOf(first, second))

        assertEquals(2, result.size)
        assertTrue(result.map(Earthquake::source).containsAll(listOf("SGC", "USGS")))
    }

    private fun quake(
        source: String,
        id: String,
        latitude: Double,
        longitude: Double,
        timestamp: Long = 1_700_000_000_000L,
        magnitude: Double = 3.0,
    ) = Earthquake(
        id = id,
        place = "Prueba",
        magnitude = magnitude,
        magnitudeType = "M",
        depthKm = 10.0,
        timestamp = timestamp,
        source = source,
        latitude = latitude,
        longitude = longitude,
    )
}
