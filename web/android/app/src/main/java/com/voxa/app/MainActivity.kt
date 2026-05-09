package com.voxa.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private var keepAliveActive = false

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VoiceCallKeepAlivePlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge?.webView?.settings?.mediaPlaybackRequiresUserGesture = false
    }

    fun setKeepAlive(active: Boolean) {
        keepAliveActive = active
    }

    override fun onPause() {
        if (keepAliveActive) {
            // Only call AppCompatActivity.onPause, skip bridge.onPause()
            // which would pause the WebView and kill WebRTC
        } else {
            super.onPause()
        }
    }

    override fun onStop() {
        if (keepAliveActive) {
            // Skip bridge.onStop() to keep WebView running
        } else {
            super.onStop()
        }
    }
}
