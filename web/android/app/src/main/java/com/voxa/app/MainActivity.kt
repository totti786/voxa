package com.voxa.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VoiceCallKeepAlivePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
