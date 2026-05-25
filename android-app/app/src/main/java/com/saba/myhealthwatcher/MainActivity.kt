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
 * Minimal — no Huawei SDK dependencies.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var authorizeButton: Button
    private lateinit var statusTextView: TextView
    private lateinit var settingsButton: ImageButton

    private lateinit var authManager: AuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        authorizeButton = findViewById(R.id.authorizeButton)
        statusTextView = findViewById(R.id.statusTextView)
        settingsButton = findViewById(R.id.settingsButton)

        authManager = AuthManager(this)

        authorizeButton.setOnClickListener {
            startAuthorization()
        }

        settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        val app = application as MyHealthWatcherApp
        statusTextView.text = "Backend: ${app.backendUrl}"
    }

    private fun startAuthorization() {
        lifecycleScope.launch {
            try {
                authorizeButton.isEnabled = false
                statusTextView.text = getString(R.string.authorizing)

                val authUrl = authManager.getAuthorizationUrl()

                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(authUrl))
                startActivity(intent)

                kotlinx.coroutines.delay(5000)
                authorizeButton.isEnabled = true
                if (statusTextView.text == getString(R.string.authorizing)) {
                    val app = application as MyHealthWatcherApp
                    statusTextView.text = "Backend: ${app.backendUrl}"
                }
            } catch (e: Exception) {
                statusTextView.text = getString(R.string.error, e.message)
                authorizeButton.isEnabled = true
            }
        }
    }
}
