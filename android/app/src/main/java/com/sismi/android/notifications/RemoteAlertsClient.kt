package com.sismi.android.notifications

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import com.sismi.android.data.EventScope
import com.sismi.android.data.SismiSettings
import com.sismi.android.data.SismiTime
import com.sismi.android.data.SismiStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit

class RemoteAlertsClient(context: Context) {
    private val appContext = context.applicationContext
    private val store = SismiStore(appContext)
    private val credentials = RemoteCredentialsStore(appContext)
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .callTimeout(18, TimeUnit.SECONDS)
        .build()

    fun isRegistered(): Boolean = credentials.isRegistered()

    suspend fun autoRegister(settings: SismiSettings): String = withContext(Dispatchers.IO) {
        val configuredUrl = settings.remoteServerUrl.ifBlank { DEFAULT_SERVER_URL }
        val baseUrl = normalizeBaseUrl(configuredUrl)
        val firebaseIdentity = currentFirebaseIdentity() ?: error("Firebase no está configurado en esta instalación de Sismi.")
        val body = JSONObject()
            .put("installationId", store.remoteInstallationId())
            .put("firebaseInstallationId", firebaseIdentity.installationId)
            .put("firebaseMessagingToken", firebaseIdentity.messagingToken)
            .put("settings", settings.toRemoteJson())
        val result = request("POST", "$baseUrl/api/devices/auto-register", body)
        val deviceToken = result.optString("deviceToken")
        require(deviceToken.length >= 32) { "El servidor no devolvió una sesión válida." }
        credentials.saveDeviceToken(deviceToken)
        baseUrl
    }

    suspend fun connect(serverUrl: String, pairingCode: String, settings: SismiSettings) = withContext(Dispatchers.IO) {
        val baseUrl = normalizeBaseUrl(serverUrl)
        require(pairingCode.trim().length >= 24) { "El código debe tener al menos 24 caracteres." }
        val firebaseIdentity = currentFirebaseIdentity() ?: error("Firebase no está configurado en esta instalación de Sismi.")
        val body = JSONObject()
            .put("installationId", store.remoteInstallationId())
            .put("pairingCode", pairingCode.trim())
            .put("firebaseInstallationId", firebaseIdentity.installationId)
            .put("firebaseMessagingToken", firebaseIdentity.messagingToken)
            .put("settings", settings.toRemoteJson())
        val result = request("POST", "$baseUrl/api/devices/register", body)
        val deviceToken = result.optString("deviceToken")
        require(deviceToken.length >= 32) { "El servidor no devolvió una sesión válida." }
        credentials.saveDeviceToken(deviceToken)
    }

    suspend fun sync(settings: SismiSettings) = withContext(Dispatchers.IO) {
        val baseUrl = normalizeBaseUrl(settings.remoteServerUrl)
        val deviceToken = credentials.loadDeviceToken() ?: error("Este teléfono todavía no está vinculado al servidor.")
        val firebaseIdentity = currentFirebaseIdentity() ?: error("Firebase no está configurado en esta instalación de Sismi.")
        request(
            method = "PATCH",
            url = "$baseUrl/api/devices/${store.remoteInstallationId()}",
            body = JSONObject()
                .put("firebaseInstallationId", firebaseIdentity.installationId)
                .put("firebaseMessagingToken", firebaseIdentity.messagingToken)
                .put("settings", settings.toRemoteJson()),
            token = deviceToken,
        )
    }

    suspend fun test(settings: SismiSettings) = withContext(Dispatchers.IO) {
        val baseUrl = normalizeBaseUrl(settings.remoteServerUrl)
        val deviceToken = credentials.loadDeviceToken() ?: error("Vincula este teléfono antes de probar el aviso remoto.")
        request("POST", "$baseUrl/api/devices/${store.remoteInstallationId()}/test", JSONObject(), deviceToken)
    }

    suspend fun disconnect(settings: SismiSettings) = withContext(Dispatchers.IO) {
        val baseUrl = normalizeBaseUrl(settings.remoteServerUrl)
        val deviceToken = credentials.loadDeviceToken()
        if (deviceToken != null) request("DELETE", "$baseUrl/api/devices/${store.remoteInstallationId()}", JSONObject(), deviceToken)
        credentials.clearDeviceToken()
    }

    suspend fun syncRefreshedToken(firebaseInstallationId: String, firebaseMessagingToken: String, settings: SismiSettings) = withContext(Dispatchers.IO) {
        if (!settings.remoteAlertsEnabled || credentials.loadDeviceToken() == null) return@withContext
        val baseUrl = normalizeBaseUrl(settings.remoteServerUrl)
        request(
            "PATCH",
            "$baseUrl/api/devices/${store.remoteInstallationId()}",
            JSONObject()
                .put("firebaseInstallationId", firebaseInstallationId)
                .put("firebaseMessagingToken", firebaseMessagingToken)
                .put("settings", settings.toRemoteJson()),
            credentials.loadDeviceToken(),
        )
    }

    private data class FirebaseIdentity(val installationId: String, val messagingToken: String)

    private suspend fun currentFirebaseIdentity(): FirebaseIdentity? {
        if (FirebaseApp.getApps(appContext).isEmpty()) return null
        return runCatching {
            val messagingToken = FirebaseMessaging.getInstance().token.await()
            val installationId = FirebaseInstallations.getInstance().id.await()
            FirebaseIdentity(installationId, messagingToken)
        }.getOrNull()
    }

    private fun request(method: String, url: String, body: JSONObject, token: String? = null): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .method(method, if (method == "GET") null else body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()
        return client.newCall(request).execute().use { response ->
            val payload = runCatching { JSONObject(response.body?.string().orEmpty()) }.getOrDefault(JSONObject())
            if (!response.isSuccessful) error(payload.optString("error").ifBlank { "El servidor respondió con HTTP ${response.code}." })
            payload
        }
    }

    private fun normalizeBaseUrl(value: String): String {
        val url = value.trim().trimEnd('/')
        val uri = runCatching { URI(url) }.getOrElse { error("Escribe la dirección segura del servidor.") }
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.rawQuery == null && uri.rawFragment == null) {
            "La dirección del servidor debe empezar por https:// y no incluir rutas adicionales."
        }
        return url
    }

    private fun SismiSettings.toRemoteJson(): JSONObject {
        val global = scope == EventScope.GLOBAL
        return JSONObject()
            .put("alertsEnabled", alertsEnabled)
            .put("alertSound", alertSound)
            .put("minimumMagnitude", minimumMagnitude.toDouble())
            .put("source", source)
            .put("scope", scope.name)
            .put("radiusKm", radiusKm)
            .put("latitude", if (global) JSONObject.NULL else roundLocation(location.latitude))
            .put("longitude", if (global) JSONObject.NULL else roundLocation(location.longitude))
            .put("maxAlertsPerUpdate", maxAlertsPerUpdate.coerceIn(1, 10))
            .put("doNotDisturb", doNotDisturb)
            .put("quietHours", quietHours)
            .put("quietHoursStart", quietHoursStart)
            .put("quietHoursEnd", quietHoursEnd)
            .put("timeZone", SismiTime.zoneId)
    }

    private fun roundLocation(value: Double): Double = kotlin.math.round(value * 100.0) / 100.0

    private companion object {
        const val DEFAULT_SERVER_URL = "https://alertassismi.jaofy.com"
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
