package com.saba.myhealthwatcher

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Manages OAuth authentication flow with Huawei Health Kit.
 */
class AuthManager(private val context: Context) {

    companion object {
        private const val REDIRECT_URI = "myhealthwatcher://callback"
        private const val AUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize"
        private const val SCOPE = "https://www.huawei.com/healthkit"
    }

    // Use OAuth client ID from Application class
    private val clientId: String
        get() = MyHealthWatcherApp.OAUTH_CLIENT_ID

    // Backend URL from Application class (configurable)
    private val backendUrl: String
        get() = MyHealthWatcherApp.backendUrl

    private val client: OkHttpClient
    private val gson = Gson()

    init {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        client = OkHttpClient.Builder()
            .addInterceptor(logging)
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
     *
     * @param code The authorization code from OAuth callback
     * @return true if successful, false otherwise
     */
    suspend fun sendAuthorizationCode(code: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = JsonObject().apply {
                addProperty("code", code)
            }

            val mediaType = "application/json".toMediaType()
            val body = json.toString().toRequestBody(mediaType)

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
