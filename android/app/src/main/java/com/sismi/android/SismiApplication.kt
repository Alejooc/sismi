package com.sismi.android

import android.app.Application
import com.sismi.android.notifications.SismiNotifications
import org.osmdroid.config.Configuration

class SismiApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        Configuration.getInstance().userAgentValue = packageName
        SismiNotifications(this).createChannels()
    }
}
