# Keep Capacitor
-keep class com.getcapacitor.** { *; }
-keep class com.voxa.app.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Keep WebView JS interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Kotlin metadata for reflection
-keep class kotlin.Metadata { *; }

