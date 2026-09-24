package com.sismi.android.data

import java.time.ZoneId

object SismiTime {
    /**
     * Obtiene la zona actual del dispositivo en cada lectura. ICU se actualiza
     * con los cambios de zona de Android, incluso cuando la JVM conserva una
     * zona anterior en memoria.
     */
    val zone: ZoneId
        get() = runCatching {
            ZoneId.of(android.icu.util.TimeZone.getDefault().id)
        }.getOrElse { ZoneId.systemDefault() }

    val zoneId: String
        get() = zone.id
}
