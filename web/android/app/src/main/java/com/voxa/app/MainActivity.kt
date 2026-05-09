package com.voxa.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private var keepAliveActive = false

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VoiceCallKeepAlivePlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge?.webView?.settings?.mediaPlaybackRequiresUserGesture = false

        // Set renderer priority so Android doesn't throttle the WebView in background
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge?.webView?.setRendererPriorityPolicy(
                WebView.RENDERER_PRIORITY_IMPORTANT, false
            )
        }

        requestAppPermissions()
    }

    private fun requestAppPermissions() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.RECORD_AUDIO)
        }
        if (perms.isNotEmpty()) {
            requestPermissions(perms.toTypedArray(), 1001)
        }
    }

    fun setKeepAlive(active: Boolean) {
        keepAliveActive = active
        if (active) {
            // Keep screen-on flag prevents deep sleep from killing audio
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun onPause() {
        if (!keepAliveActive) {
            super.onPause()
        }
        // When keepAlive is active, skip super.onPause() entirely
        // The foreground service keeps the process alive
    }

    override fun onStop() {
        if (!keepAliveActive) {
            super.onStop()
        }
    }
}
