# Huawei Developer Console Setup Guide

This guide explains how to configure the Huawei Developer Console for MyHealthWatcher.

## Overview

Before the app can work, you need to configure the following in [Huawei AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html):

1. **OAuth 2.0 credentials**
2. **Redirect URI**
3. **App signing certificate fingerprint**

## Step-by-Step Configuration

### 1. Access AppGallery Connect

1. Go to [https://developer.huawei.com/consumer/](https://developer.huawei.com/consumer/)
2. Sign in with your Huawei account
3. Navigate to **AppGallery Connect**
4. Select project: **MyHealthWatch** (project_id: 101653523863763121)

### 2. Configure OAuth 2.0

#### 2.1. Enable OAuth 2.0 Service

1. Go to **Build** → **OAuth 2.0**
2. Click **Enable OAuth 2.0**

#### 2.2. Add OAuth Client

1. Click **Add OAuth Client**
2. Configure:
   - **Client Type:** Native
   - **Redirect URI:** `myhealthwatcher://callback`
   - **Scope:** `https://www.huawei.com/healthkit`
   - **App ID:** 117266467 (should be auto-filled)

3. Click **Create**

### 3. Configure App Signing

#### 3.1. For Debug Builds (Testing)

For testing with debug APK, you need to add the debug signing certificate fingerprint:

```bash
# Get debug keystore path (usually):
~/.android/debug.keystore

# Extract SHA-256 fingerprint:
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Look for **Certificate fingerprints** → **SHA-256**. Copy this value.

#### 3.2. Add Fingerprint to Huawei Console

1. Go to **My Apps** → Select your app
2. Go to **Project Settings** → **General Information**
3. Scroll to **App Signing** section
4. Click **Add** next to **Certificate Fingerprints**
5. Paste the SHA-256 fingerprint from step 3.1
6. Click **Save**

#### 3.3. For Release Builds (Production)

When you're ready for production, you'll need to generate a release keystore and add its fingerprint:

```bash
# Generate release keystore
keytool -genkey -v -keystore myhealthwatcher.jks -keyalg RSA -keysize 2048 -validity 10000 -alias myhealthwatcher

# Extract SHA-256 fingerprint
keytool -list -v -keystore myhealthwatcher.jks -alias myhealthwatcher
```

Add this SHA-256 fingerprint to Huawei Console as well.

### 4. Verify Configuration

Check that these values match:

| Setting | Value |
|---------|-------|
| **Project ID** | 101653523863763121 |
| **App ID** | 117266467 |
| **Package Name** | com.saba.myhealthwatcher |
| **Redirect URI** | myhealthwatcher://callback |
| **Client ID** | 1917539503149440256 |
| **Scope** | https://www.huawei.com/healthkit |

### 5. Download agconnect-services.json

1. In AppGallery Connect, go to **Project Settings** → **General Information**
2. Click **Download agconnect-services.json**
3. Place it in: `android-app/app/agconnect-services.json`

This should already be done if `agconnect-services.json` exists in the app folder.

### 6. Test Configuration

After configuration, test the app:

1. Build and install the debug APK (see `BUILD_INSTRUCTIONS.md`)
2. Open MyHealthWatcher app
3. Tap "Autorizar con Huawei Health"
4. You should be redirected to Huawei's OAuth page
5. Sign in and authorize
6. App should receive the callback and show success

If you see an OAuth error, verify:
- Redirect URI matches exactly: `myhealthwatcher://callback`
- Package name matches: `com.saba.myhealthwatcher`
- Certificate fingerprint is added
- OAuth 2.0 is enabled

## Common Issues

### Error: "redirect_uri_mismatch"

**Cause:** Redirect URI in Huawei Console doesn't match the app.

**Fix:**
1. Check `AuthManager.kt` line ~25: `private const val REDIRECT_URI = "myhealthwatcher://callback"`
2. Verify Huawei Console has the same URI (no trailing slash, correct case)

### Error: "client_not_found" or "invalid_client"

**Cause:** Client ID doesn't match or OAuth not enabled.

**Fix:**
1. Verify OAuth 2.0 is enabled in Huawei Console
2. Check `agconnect-services.json` has correct `client_id`
3. Regenerate `agconnect-services.json` from Huawei Console

### Error: "certificate_signature_invalid"

**Cause:** Certificate fingerprint not added or doesn't match.

**Fix:**
1. Re-extract SHA-256 fingerprint from keystore
2. Add to Huawei Console under App Signing
3. For debug builds, use `~/.android/debug.keystore`
4. Wait 5-10 minutes for changes to propagate

### Error: "package_name_mismatch"

**Cause:** Package name in app doesn't match Huawei Console.

**Fix:**
1. Verify `AndroidManifest.xml`: `package="com.saba.myhealthwatcher"`
2. Verify `app/build.gradle`: `applicationId "com.saba.myhealthwatcher"`
3. Verify Huawei Console shows same package name

## Production Checklist

Before releasing to production:

- [ ] Generate release keystore and add SHA-256 fingerprint
- [ ] Update `agconnect-services.json` if needed
- [ ] Verify redirect URI: `myhealthwatcher://callback`
- [ ] Test OAuth flow with release APK
- [ ] Remove debug fingerprint from Huawei Console (optional, for security)
- [ ] Review permissions in Huawei Console
- [ ] Confirm Health Kit service is enabled

## URLs Reference

- **Huawei Developer Portal:** https://developer.huawei.com/consumer/
- **AppGallery Connect:** https://developer.huawei.com/consumer/cn/service/josp/agc/index.html
- **OAuth Documentation:** https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/oauth2-V5
- **Health Kit Documentation:** https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/healthkit-dev-guide-V5

---

**Last Updated:** 2026-03-31
