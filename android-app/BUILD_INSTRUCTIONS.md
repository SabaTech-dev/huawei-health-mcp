# Build Instructions for MyHealthWatcher Android App

## Quick Start

### 1. Update Backend URL (REQUIRED)

Before building, update the backend URL in the app:

```bash
# Edit this file:
/home/ubuntu/huawei-health-mcp/android-app/app/src/main/java/com/saba/myhealthwatcher/AuthManager.kt

# Change line ~27:
private const val BACKEND_URL = "http://YOUR_LOCAL_IP:8080/api/v1/auth/callback"
```

Find your local IP:
```bash
# On Linux (where backend is running)
hostname -I | awk '{print $1}'
```

Example: `http://192.168.1.100:8080/api/v1/auth/callback`

### 2. Build APK

#### Option A: Using Android Studio (Recommended)

1. Open project in Android Studio:
   ```bash
   cd /home/ubuntu/huawei-health-mcp/android-app
   ```
   Then open this folder in Android Studio

2. Sync Gradle:
   - Click "Sync Project with Gradle Files" (prompt should appear automatically)
   - Or go to: `File > Sync Project with Gradle Files`

3. Build APK:
   ```
   Build > Build Bundle(s) / APK(s) > Build APK(s)
   ```

4. Find APK:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```

#### Option B: Using Command Line

```bash
cd /home/ubuntu/huawei-health-mcp/android-app

# Download Gradle wrapper (first time only)
./gradlew wrapper --gradle-version 8.0

# Build debug APK
./gradlew assembleDebug

# APK location:
ls -lh app/build/outputs/apk/debug/app-debug.apk
```

### 3. Install on Device

#### Via ADB (with USB)

```bash
# Enable USB debugging on your Huawei phone first
# Then:
adb devices  # Should show your device
adb install app/build/outputs/apk/debug/app-debug.apk
```

#### Manual Installation

1. Copy `app/build/outputs/apk/debug/app-debug.apk` to your phone (USB, cloud, etc.)
2. Open file manager and tap the APK
3. Allow installation from unknown sources if prompted
4. Install

### 4. Start Backend

```bash
cd /home/ubuntu/huawei-health-mcp/api

# Activate virtual environment
source venv/bin/activate

# Set environment variables
export HUAWEI_CLIENT_ID=1917539503149440256
export HUAWEI_CLIENT_SECRET=REDACTED_HUAWEI_CLIENT_SECRET
export HUAWEI_REDIRECT_URI=myhealthwatcher://callback
export HUAWEI_SCOPES=https://www.huawei.com/healthkit
export SECRET_KEY=your-secret-key-here

# Start backend
uvicorn src.main:app --host 0.0.0.0 --port 8080
```

### 5. Test Authorization Flow

1. Open **MyHealthWatcher** app on your phone
2. Tap **"Autorizar con Huawei Health"**
3. Sign in to your Huawei account (if needed)
4. Grant permissions to access health data
5. App will redirect back and send auth code to backend
6. You should see **"¡Autorización exitosa!"** in the app

Verify backend received token:
```bash
curl http://localhost:8080/api/v1/auth/status
# Should return: {"authenticated":true}
```

## Troubleshooting

### Build Errors

**Error: "SDK location not found"**
- Set `ANDROID_HOME` environment variable:
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  ```

**Error: "Could not resolve com.android.tools.build:gradle"**
- Check internet connection
- Try deleting `.gradle` folder and rebuilding:
  ```bash
  rm -rf .gradle
  ./gradlew assembleDebug
  ```

**Error: "Gradle sync failed"**
- In Android Studio: `File > Invalidate Caches / Restart`
- Check `File > Project Structure > SDK Location`

### Runtime Errors

**"Backend URL not found"**
- Verify `BACKEND_URL` in `AuthManager.kt` matches your actual backend IP
- Check backend is running: `curl http://YOUR_IP:8080/api/v1/health`

**"OAuth authorization failed"**
- Ensure package name matches Huawei Console: `com.saba.myhealthwatcher`
- Verify `agconnect-services.json` is in `app/` folder
- Check signing configuration (debug builds use auto-generated key)

**"No code received"**
- Verify Huawei Developer Console has correct redirect URI:
  ```
  myhealthwatcher://callback
  ```
- Check AndroidManifest.xml has correct intent filter

### Network Issues

**App can't reach backend**
- Ensure phone and backend are on same WiFi network
- Check firewall on backend machine allows port 8080
- Try pinging backend IP from phone

## Release Build

For production/signed APK:

1. Generate keystore (one-time):
   ```bash
   keytool -genkey -v -keystore myhealthwatcher.jks -keyalg RSA -keysize 2048 -validity 10000 -alias myhealthwatcher
   ```

2. Add signing config to `app/build.gradle`:
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file("myhealthwatcher.jks")
               storePassword "your_store_password"
               keyAlias "myhealthwatcher"
               keyPassword "your_key_password"
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled true
               proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```

3. Build release APK:
   ```bash
   ./gradlew assembleRelease
   ```

4. APK location: `app/build/outputs/apk/release/app-release.apk`

**Important:** Register the release APK's signing certificate fingerprint in Huawei Developer Console:
```bash
keytool -list -v -keystore myhealthwatcher.jks -alias myhealthwatcher
```
Copy the SHA-256 fingerprint to Huawei Console under App Signing.

## Clean Build

To clean everything and rebuild:

```bash
./gradlew clean
./gradlew assembleDebug
```

## Summary Checklist

- [ ] Backend URL updated in `AuthManager.kt`
- [ ] `agconnect-services.json` present in `app/` folder
- [ ] Gradle sync successful
- [ ] APK built without errors
- [ ] Backend running on port 8080
- [ ] Backend URL reachable from phone
- [ ] Huawei Health app installed on phone
- [ ] App installed and authorization flow tested
- [ ] Backend shows `authenticated: true`

---

**For questions:** Check `README.md` for full documentation
