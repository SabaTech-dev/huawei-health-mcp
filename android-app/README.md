# MyHealthWatcher - Huawei Health OAuth Bridge

Minimal Android app to authorize Huawei Health Kit access and forward authorization codes to the backend API.

## Overview

**Purpose:** OAuth bridge between Huawei Health (Watch GT 5 Pro) and the backend API.

**Flow:**
```
Watch GT 5 Pro → Huawei Health → MyHealthWatcher App → Backend API (8080) → MCP Server → OpenClaw
```

## Configuration

### Package Name
`com.saba.myhealthwatcher`

### Huawei Credentials
- **App ID:** `117266467`
- **Client ID:** `1917539503149440256`
- **Project ID:** `101653523863763121`

### Important: Update Backend URL

Before building, update the backend URL in `app/src/main/java/com/saba/myhealthwatcher/AuthManager.kt`:

```kotlin
// Change this to your actual backend URL
private const val BACKEND_URL = "http://YOUR_LOCAL_IP:8080/api/v1/auth/callback"
```

To find your local IP (for testing on the same network):
```bash
# On Linux/macOS
hostname -I

# On Windows
ipconfig
```

## Build Instructions

### Prerequisites
1. Android Studio 2023.1+
2. JDK 11 or higher
3. Android SDK with API 34

### Building with Android Studio

1. **Open the project:**
   ```bash
   cd /home/ubuntu/huawei-health-mcp/android-app
   # Open this folder in Android Studio
   ```

2. **Sync Gradle:**
   - Open `File > Sync Project with Gradle Files`
   - Wait for dependencies to download

3. **Build APK:**
   ```
   Build > Build Bundle(s) / APK(s) > Build APK(s)
   ```

4. **Locate APK:**
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```

### Building with Command Line

```bash
cd /home/ubuntu/huawei-health-mcp/android-app

# Build debug APK
./gradlew assembleDebug

# Build release APK (requires signing)
./gradlew assembleRelease

# Install on connected device
./gradlew installDebug
```

## Installation

### Via ADB

1. **Enable USB debugging on your Android device:**
   - Settings > About Phone > Tap Build Number 7 times
   - Settings > Developer Options > USB Debugging

2. **Install APK:**
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Verify installation:**
   ```bash
   adb devices
   ```

### Manual Installation

1. **Copy APK to device** (via USB, cloud, or transfer app)
2. **Install APK** from file manager
3. **Allow installation from unknown sources** if prompted

## Authorization Flow

1. **Open MyHealthWatcher app** on your device
2. **Tap "Autorizar con Huawei Health"**
3. **Sign in to your Huawei account** (if not already)
4. **Grant permissions** to access health data
5. **App redirects back** and sends authorization code to backend
6. **Success!** Backend now has access token for Health Kit API

## Backend Integration

The app sends the authorization code to the backend via POST request:

**Endpoint:** `POST /api/v1/auth/callback`
**Body:**
```json
{
  "code": "your_authorization_code_here"
}
```

The backend should handle the OAuth flow and exchange the code for access tokens.

## Troubleshooting

### App Won't Connect to Backend

1. **Check your local IP** - Make sure `BACKEND_URL` in `AuthManager.kt` matches your backend's actual IP
2. **Verify backend is running:** `curl http://YOUR_IP:8080/api/v1/auth/status`
3. **Check firewall:** Ensure port 8080 is open
4. **Same network:** Device and backend must be on the same network

### OAuth Fails

1. **Verify package name:** Must match Huawei Developer Console (`com.saba.myhealthwatcher`)
2. **Check signing:** Debug signing may fail in production - use release signing
3. **Verify credentials:** `agconnect-services.json` must match your Huawei project

### Build Errors

1. **Gradle sync issues:** Try `File > Invalidate Caches / Restart`
2. **Missing SDK:** Install SDK Platform API 34 in SDK Manager
3. **Dependency conflicts:** Try `./gradlew clean build`

## Files Structure

```
android-app/
├── app/
│   ├── build.gradle                 # App-level Gradle config
│   ├── agconnect-services.json      # Huawei credentials
│   ├── proguard-rules.pro           # ProGuard rules
│   └── src/main/
│       ├── AndroidManifest.xml      # App manifest
│       ├── java/com/saba/myhealthwatcher/
│       │   ├── MainActivity.kt      # Main UI
│       │   ├── AuthManager.kt       # OAuth logic
│       │   └── OAuthCallbackActivity.kt  # OAuth callback handler
│       └── res/
│           ├── layout/
│           │   └── activity_main.xml   # Main UI layout
│           ├── values/
│           │   ├── strings.xml        # String resources
│           │   ├── colors.xml         # Color resources
│           │   └── themes.xml         # App theme
│           └── xml/
│               ├── backup_rules.xml
│               └── data_extraction_rules.xml
├── build.gradle                     # Project-level Gradle
├── settings.gradle                  # Gradle settings
├── gradle.properties                # Gradle properties
└── README.md                        # This file
```

## Security Notes

- **Do NOT hardcode secrets** - All credentials are in `agconnect-services.json`
- **Use HTTPS in production** - Change `usesCleartextTraffic` to `false` and update URLs
- **Verify backend SSL** - Use certificate pinning for production
- **Store tokens securely** - Backend should store access tokens in encrypted storage

## Next Steps

1. ✅ App built and installed
2. ✅ Backend running at `http://YOUR_IP:8080`
3. ✅ Authorization flow tested
4. ✅ Backend can access Health Kit data
5. 🔄 MCP Server consuming Health Kit API

## Support

For issues with:
- **Huawei Health Kit:** https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/healthkit-dev-guide-V5
- **Huawei OAuth:** https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/oauth2-V5

---

**Version:** 1.0.0
**Last Updated:** 2026-03-31
