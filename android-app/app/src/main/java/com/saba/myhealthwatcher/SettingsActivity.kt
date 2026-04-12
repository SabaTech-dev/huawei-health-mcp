package com.saba.myhealthwatcher

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Settings screen for MyHealthWatcher.
 * Allows configuring the backend URL and shows app info.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var backendUrlEditText: EditText
    private lateinit var clientIdTextView: TextView
    private lateinit var appIdTextView: TextView
    private lateinit var saveButton: Button
    private lateinit var resetButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = getString(R.string.settings_title)

        val app = application as MyHealthWatcherApp

        // Initialize views
        backendUrlEditText = findViewById(R.id.backendUrlEditText)
        clientIdTextView = findViewById(R.id.clientIdTextView)
        appIdTextView = findViewById(R.id.appIdTextView)
        saveButton = findViewById(R.id.saveButton)
        resetButton = findViewById(R.id.resetButton)

        // Populate current values
        backendUrlEditText.setText(app.getBackendUrl())
        clientIdTextView.text = MyHealthWatcherApp.OAUTH_CLIENT_ID
        appIdTextView.text = MyHealthWatcherApp.APP_ID

        // Save button
        saveButton.setOnClickListener {
            val newUrl = backendUrlEditText.text.toString().trim()
            if (newUrl.isBlank()) {
                Toast.makeText(this, getString(R.string.error_empty_url), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            app.setBackendUrl(newUrl)
            Toast.makeText(this, getString(R.string.settings_saved), Toast.LENGTH_SHORT).show()
            finish()
        }

        // Reset button
        resetButton.setOnClickListener {
            backendUrlEditText.setText(BuildConfig.BACKEND_URL)
            app.resetBackendUrl()
            Toast.makeText(this, getString(R.string.settings_reset), Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
