package com.sismi.android.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.sismi.android.MainActivity
import com.sismi.android.R
import com.sismi.android.data.Earthquake

class SismiNotifications(private val context: Context) {
    fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val soundChannel = NotificationChannel(ALERT_CHANNEL_SOUND, "Alertas sísmicas · Con sonido", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Avisos de sismos que coinciden con tus preferencias"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 180, 500, 180, 800)
            setSound(alarmSound, audioAttributes)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        val quietChannel = NotificationChannel(ALERT_CHANNEL_SILENT, "Alertas sísmicas · Sin sonido", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Avisos de sismos con vibración, sin sonido"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 180, 500, 180, 800)
            setSound(null, audioAttributes)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannels(listOf(soundChannel, quietChannel))
    }

    fun hasPermission(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun notifyEarthquake(event: Earthquake, distance: Double?, sound: Boolean) {
        val distanceText = distance?.let { " · ${it.toInt()} km de tu ubicación" }.orEmpty()
        show(
            id = event.id.hashCode(),
            title = "Sismo M ${"%.1f".format(java.util.Locale.US, event.magnitude)} · ${event.place}",
            body = "${event.source} · ${event.depthKm?.let { "${it.toInt()} km de profundidad" } ?: "Profundidad no disponible"}$distanceText",
            eventId = event.id,
            sound = sound,
        )
    }

    fun test(sound: Boolean) {
        show(9001, "Prueba de alerta de Sismi", "Así sonarán los avisos sísmicos en este dispositivo.", null, sound)
    }

    private fun show(id: Int, title: String, body: String, eventId: String?, sound: Boolean) {
        if (!hasPermission()) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            eventId?.let { putExtra(EXTRA_EVENT_ID, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val channel = if (sound) ALERT_CHANNEL_SOUND else ALERT_CHANNEL_SILENT
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_sismi)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id, notification) }
    }

    companion object {
        const val ALERT_CHANNEL_SOUND = "sismi_earthquake_alerts_sound_v1"
        const val ALERT_CHANNEL_SILENT = "sismi_earthquake_alerts_silent_v1"
        const val EXTRA_EVENT_ID = "com.sismi.android.EVENT_ID"
    }
}
