package com.voxa.app

import android.content.Intent
import android.os.Build
import android.Manifest
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "VoiceCallKeepAlive",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class VoiceCallKeepAlivePlugin : Plugin() {

    @PluginMethod
    fun start(call: PluginCall) {
        activity.runOnUiThread {
            (activity as? MainActivity)?.setKeepAlive(true)
        }

        // Need both RECORD_AUDIO and POST_NOTIFICATIONS (Android 13+) before starting FGS
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            call.resolve()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                call.resolve()
                return
            }
        }

        try {
            val intent = Intent(context, VoiceCallService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            android.util.Log.e("VoiceCallKeepAlive", "Failed to start service", e)
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            (activity as? MainActivity)?.setKeepAlive(false)
        }
        try {
            val intent = Intent(context, VoiceCallService::class.java)
            context.stopService(intent)
        } catch (e: Exception) {
            android.util.Log.e("VoiceCallKeepAlive", "Failed to stop service", e)
        }
        call.resolve()
    }
}
