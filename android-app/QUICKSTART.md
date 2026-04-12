# MyHealthWatcher - Quick Start Guide

## ⚡ 5-Minute Setup

### Prerequisites
- Android Studio installed
- Huawei phone with USB debugging enabled
- Backend running on your network

### Step 1: Update Backend URL (CRITICAL)

Edit `app/src/main/java/com/saba/myhealthwatcher/AuthManager.kt`, line ~31:

```kotlin
// Change this:
private const val BACKEND_URL = "http://YOUR_LOCAL_IP:8080/api/v1/auth/callback"

// To your actual backend IP, e.g.:
private const val BACKEND_URL = "http://192.168.1.100:8080/api/v1/auth/callback"
```

Find your backend IP:
```bash
# On the machine running the backend
hostname -I | awk '{print $1}'
```

### Step 2: Build APK

```bash
cd /home/ubuntu/huawei-health-mcp/android-app
./gradlew assembleDebug
```

APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

### Step 3: Install on Phone

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Step 4: Test Authorization

1. Open **MyHealthWatcher** app on your phone
2. Tap **"Autorizar con Huawei Health"**
3. Sign in to your Huawei account
4. Grant health data permissions
5. You should see **"¡Autorización exitosa!"**

### Step 5: Verify Backend

```bash
curl http://localhost:8080/api/v1/auth/status
# Response: {"authenticated": true}
```

## 🐛 Troubleshooting

**Build fails?** → See `BUILD_INSTRUCTIONS.md`

**OAuth fails?** → Check `HUAWEI_CONSOLE_SETUP.md`

**Network issues?** → Ensure phone and backend on same WiFi

**Backend URL?** → Double-check IP in AuthManager.kt

## 📚 Full Documentation

- **README.md** - Complete overview
- **BUILD_INSTRUCTIONS.md** - Detailed build guide
- **HUAWEI_CONSOLE_SETUP.md** - Huawei Console configuration
- **PROJECT_SUMMARY.md** - Technical summary

---

**Done in 5 minutes** 🎉
