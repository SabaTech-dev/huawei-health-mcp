package com.saba.myhealthwatcher

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Manages OAuth authentication flow with Huawei Health Kit.
 * Minimal — no Huawei SDK, uses browser-based OAuth.
 */
class AuthManager(private val context: Context) {

    companion object {
        private const val REDIRECT_URI = "myhealthwatcher://callback"
        private const val AUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize"
        private const val SCOPE = "https://www.huawei.com/healthkit"
    }

    private val clientId: String
        get() = MyHealthWatcherApp.OAUTH_CLIENT_ID

    private val backendUrl: String
        get() = (context.applicationContext as MyHealthWatcherApp).backendUrl

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Get the authorization URL to start OAuth flow.
     */
    fun getAuthorizationUrl(): String {
        return buildString {
            append(AUTH_URL)
            append("?client_id=$clientId")
            append("&redirect_uri=$REDIRECT_URI")
            append("&response_type=code")
            append("&scope=$SCOPE")
        }
    }

    /**
     * Send authorization code to backend API.
     */
    suspend fun sendAuthorizationCode(code: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = """{"code":"$code"}"""
            val mediaType = "application/json".toMediaType()
            val body = json.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(backendUrl)
                .post(body)
                .addHeader("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()
            return@withContext response.isSuccessful
        } catch (e: Exception) {
            e.printStackTrace()
            return@withContext false
        }
    }
}
