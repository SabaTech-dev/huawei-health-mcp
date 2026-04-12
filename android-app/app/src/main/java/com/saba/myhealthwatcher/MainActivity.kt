package com.saba.myhealthwatcher

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Main activity for MyHealthWatcher OAuth bridge.
 * Handles the authorization flow with Huawei Health Kit.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var authorizeButton: Button
    private lateinit var statusTextView: TextView
    private lateinit var settingsButton: ImageButton

    private lateinit var authManager: AuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize views
        authorizeButton = findViewById(R.id.authorizeButton)
        statusTextView = findViewById(R.id.statusTextView)
        settingsButton = findViewById(R.id.settingsButton)

        // Initialize auth manager
        authManager = AuthManager(this)

        // Set authorize button click listener
        authorizeButton.setOnClickListener {
            startAuthorization()
        }

        // Set settings button click listener
        settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // Show current backend URL in status
        val app = application as MyHealthWatcherApp
        statusTextView.text = "Backend: ${app.getBackendUrl()}"
    }

    private fun startAuthorization() {
        lifecycleScope.launch {
            try {
                authorizeButton.isEnabled = false
                statusTextView.text = getString(R.string.authorizing)

                val authUrl = authManager.getAuthorizationUrl()

                // Open browser for OAuth flow
                val intent = android.content.Intent(
                    android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse(authUrl)
                )
                startActivity(intent)

                // Reset UI after delay (in case user doesn't complete flow)
                kotlinx.coroutines.delay(5000)
                authorizeButton.isEnabled = true
                if (statusTextView.text == getString(R.string.authorizing)) {
                    val app = application as MyHealthWatcherApp
                    statusTextView.text = "Backend: ${app.getBackendUrl()}"
                }

            } catch (e: Exception) {
                statusTextView.text = getString(R.string.error, e.message)
                authorizeButton.isEnabled = true
            }
        }
    }
}
