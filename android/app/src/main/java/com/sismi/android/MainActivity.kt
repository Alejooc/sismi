package com.sismi.android

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.sismi.android.notifications.SismiNotifications
import com.sismi.android.ui.SismiApp

class MainActivity : ComponentActivity() {
    private var pendingEventId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        pendingEventId = intent.getStringExtra(SismiNotifications.EXTRA_EVENT_ID)
        enableEdgeToEdge()
        SismiNotifications(this).createChannels()
        setContent {
            SismiApp(openEventId = pendingEventId, onEventOpened = { pendingEventId = null })
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingEventId = intent.getStringExtra(SismiNotifications.EXTRA_EVENT_ID)
    }
}
