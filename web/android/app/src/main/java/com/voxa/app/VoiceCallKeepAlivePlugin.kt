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
        (activity as? MainActivity)?.setKeepAlive(true)

        // On Android 13+, only start the service if notification permission is granted
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                // Service can't show notification — skip it but still keep WebView alive
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
        (activity as? MainActivity)?.setKeepAlive(false)
        try {
            val intent = Intent(context, VoiceCallService::class.java)
            context.stopService(intent)
        } catch (e: Exception) {
            android.util.Log.e("VoiceCallKeepAlive", "Failed to stop service", e)
        }
        call.resolve()
    }
}
