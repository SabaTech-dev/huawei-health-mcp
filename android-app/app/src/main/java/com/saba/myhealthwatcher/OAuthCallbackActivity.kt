package com.saba.myhealthwatcher

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Activity that handles the OAuth callback.
 * Minimal — no Huawei SDK, just sends code to backend.
 */
class OAuthCallbackActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_oauth_callback)

        val statusTextView = findViewById<TextView>(R.id.callbackStatusTextView)
        val authManager = AuthManager(this)

        val uri = intent.data

        lifecycleScope.launch {
            if (uri != null) {
                val code = uri.getQueryParameter("code")
                val error = uri.getQueryParameter("error")
                val errorDescription = uri.getQueryParameter("error_description")

                when {
                    error != null -> {
                        statusTextView.text = "Error: $error\n${errorDescription ?: "Authorization failed"}"
                        statusTextView.setTextColor(getColor(android.R.color.holo_red_dark))
                    }
                    code != null -> {
                        statusTextView.text = "Sending authorization code to backend..."

                        val success = authManager.sendAuthorizationCode(code)

                        if (success) {
                            statusTextView.text = "✓ OAuth authorization successful!\n\nYou can now close this screen."
                            statusTextView.setTextColor(getColor(android.R.color.holo_green_dark))
                        } else {
                            statusTextView.text = "✗ Failed to send code to backend.\n\nPlease try again."
                            statusTextView.setTextColor(getColor(android.R.color.holo_red_dark))
                        }
                    }
                    else -> {
                        statusTextView.text = "Error: No authorization code received"
                        statusTextView.setTextColor(getColor(android.R.color.holo_red_dark))
                    }
                }
            } else {
                statusTextView.text = "Error: No callback data received"
                statusTextView.setTextColor(getColor(android.R.color.holo_red_dark))
            }

            kotlinx.coroutines.delay(3000)

            val mainIntent = Intent(this@OAuthCallbackActivity, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(mainIntent)
            finish()
        }
    }
}
