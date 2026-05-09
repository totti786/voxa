package com.voxa.app

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(VoiceCallKeepAlivePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
