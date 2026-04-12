package com.saba.myhealthwatcher

import android.app.Application
import com.huawei.agconnect.AGConnectInstance
import com.huawei.hms.api.HuaweiApiAvailability

/**
 * Application class for MyHealthWatcher.
 * Initializes Huawei AGConnect services.
 */
class MyHealthWatcherApp : Application() {

    companion object {
        private const val TAG = "MyHealthWatcherApp"
        const val PREFS_NAME = "myhealthwatcher_prefs"
        const val PREF_BACKEND_URL = "backend_url"

        // OAuth credentials from agconnect-services.json
        const val OAUTH_CLIENT_ID = "1917539503149440256"
        const val APP_ID = "117266467"
    }

    var backendUrl: String = BuildConfig.BACKEND_URL
        private set

    override fun onCreate() {
        super.onCreate()

        // Initialize Huawei AGConnect (reads agconnect-services.json automatically)
        try {
            AGConnectInstance.initialize(this)
            HuaweiApiAvailability.getInstance().isHuaweiMobileServicesAvailable(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Load backend URL from SharedPreferences (overrides BuildConfig default)
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val savedUrl = prefs.getString(PREF_BACKEND_URL, null)
        if (!savedUrl.isNullOrBlank()) {
            backendUrl = savedUrl
        }
    }

    /**
     * Save backend URL to SharedPreferences.
     */
    fun setBackendUrl(url: String) {
        backendUrl = url
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(PREF_BACKEND_URL, url)
            .apply()
    }

    /**
     * Reset backend URL to BuildConfig default.
     */
    fun resetBackendUrl() {
        backendUrl = BuildConfig.BACKEND_URL
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .remove(PREF_BACKEND_URL)
            .apply()
    }

}
