package com.sismi.android.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import com.sismi.android.MainActivity
import com.sismi.android.R
import com.sismi.android.data.SismiStore
import com.sismi.android.data.SismiTime
import com.sismi.android.data.distanceKm
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale

class SismiWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { update(context, manager, it) }
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, SismiWidget::class.java)
            manager.getAppWidgetIds(component).forEach { update(context, manager, it) }
        }

        private fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val store = SismiStore(context)
            val settings = store.loadSettings()
            val event = store.loadEvents()
                .asSequence()
                .filter { settings.scope.name == "GLOBAL" || distanceKm(settings.location.latitude, settings.location.longitude, it) <= settings.radiusKm }
                .maxByOrNull { it.timestamp }
            val dark = settings.darkMode
            val views = RemoteViews(context.packageName, R.layout.widget_sismi)
            views.setInt(R.id.widget_root, "setBackgroundResource", if (dark) R.drawable.widget_background_dark else R.drawable.widget_background_light)
            views.setTextColor(R.id.widget_title, if (dark) Color.WHITE else Color.rgb(20, 46, 34))
            views.setTextColor(R.id.widget_subtitle, if (dark) Color.rgb(190, 207, 196) else Color.rgb(82, 108, 94))
            views.setTextColor(R.id.widget_place, if (dark) Color.WHITE else Color.rgb(20, 46, 34))
            views.setTextColor(R.id.widget_magnitude, if (dark) Color.rgb(166, 220, 184) else Color.rgb(49, 119, 82))
            views.setTextColor(R.id.widget_time, if (dark) Color.rgb(190, 207, 196) else Color.rgb(82, 108, 94))
            views.setTextColor(R.id.widget_status, if (dark) Color.rgb(190, 207, 196) else Color.rgb(82, 108, 94))
            if (event == null) {
                views.setTextViewText(R.id.widget_place, "Sin datos recientes")
                views.setTextViewText(R.id.widget_magnitude, "—")
                views.setTextViewText(R.id.widget_time, "")
                views.setTextViewText(R.id.widget_status, "Abre Sismi para actualizar")
            } else {
                views.setTextViewText(R.id.widget_place, event.place)
                views.setTextViewText(R.id.widget_magnitude, "M ${"%.1f".format(Locale.US, event.magnitude)}")
                views.setTextViewText(R.id.widget_time, formatTime(event.timestamp))
                views.setTextViewText(R.id.widget_status, "${event.source} · ${event.depthKm?.let { "${it.toInt()} km" } ?: "Profundidad no disponible"}")
            }
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                widgetId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            manager.updateAppWidget(widgetId, views)
        }

        private fun formatTime(timestamp: Long): String = DateTimeFormatter
            .ofPattern("d MMM · h:mm a", Locale.forLanguageTag("es-CO"))
            .withZone(SismiTime.zone)
            .format(Instant.ofEpochMilli(timestamp))
            .lowercase(Locale.forLanguageTag("es-CO"))
    }
}
