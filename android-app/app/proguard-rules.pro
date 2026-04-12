# Huawei Health Kit
-keep class com.huawei.hms.health.** { *; }
-keep interface com.huawei.hms.health.** { *; }
-keep class com.huawei.hihealthkit.** { *; }
-keep interface com.huawei.hihealthkit.** { *; }

# Huawei Account Kit
-keep class com.huawei.hms.support.hwid.** { *; }
-keep interface com.huawei.hms.support.hwid.** { *; }

# Huawei AGConnect
-keep class com.huawei.agconnect.** { *; }
-keep interface com.huawei.agconnect.** { *; }

# Gson (used for OAuth JSON)
-keep class com.saba.myhealthwatcher.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn com.google.gson.**

# Retrofit
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# OkHttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Coroutines
-dontwarn kotlinx.coroutines.**
