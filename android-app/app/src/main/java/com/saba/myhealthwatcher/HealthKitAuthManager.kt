package com.saba.myhealthwatcher

import android.app.Activity
import android.content.Context
import com.huawei.hms.hihealth.HiHealthOptions
import com.huawei.hms.hihealth.data.DataType
import com.huawei.hms.hihealth.data.Scopes
import com.huawei.hms.support.api.entity.auth.Scope
import com.huawei.hms.support.hwid.HuaweiIdAuthManager
import com.huawei.hms.support.hwid.result.AuthHuaweiId
import com.huawei.hms.support.hwid.request.HuaweiIdAuthParams
import com.huawei.hms.support.hwid.request.HuaweiIdAuthParamsHelper
import com.huawei.hms.support.hwid.service.HuaweiIdAuthService
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Manages Health Kit authorization using Huawei Health SDK v5.
 */
class HealthKitAuthManager(private val context: Context) {

    companion object {
        private const val TAG = "HealthKitAuthManager"
        private const val REQUEST_CODE_HEALTH_AUTH = 1001

        // Health Kit data types available in v5 SDK
        val HEALTH_DATA_TYPES = listOf(
            DataType.DT_CONTINUOUS_STEPS_TOTAL,
            DataType.DT_CONTINUOUS_CALORIES_BURNT,
            DataType.DT_CONTINUOUS_CALORIES_CONSUMED,
            DataType.DT_CONTINUOUS_DISTANCE_DELTA,
            DataType.DT_INSTANTANEOUS_HEART_RATE,
            DataType.DT_CONTINUOUS_SLEEP
        )

        // Scopes for Health Kit authorization (v5 string constants)
        val HEALTH_SCOPES = listOf(
            Scopes.HEALTHKIT_STEP_BOTH,
            Scopes.HEALTHKIT_CALORIES_BOTH,
            Scopes.HEALTHKIT_DISTANCE_BOTH,
            Scopes.HEALTHKIT_HEARTRATE_BOTH,
            Scopes.HEALTHKIT_SLEEP_BOTH
        )
    }

    /**
     * Build HuaweiIdAuthParams with Health Kit extended params.
     */
    private fun buildAuthParams(): HuaweiIdAuthParams {
        // Build HiHealthOptions with desired data types
        val hiHealthOptions = HiHealthOptions.builder().apply {
            HEALTH_DATA_TYPES.forEach { dataType ->
                addDataType(dataType, HiHealthOptions.ACCESS_READ)
            }
        }.build()

        // Build auth params with Health Kit scopes and extended params
        return HuaweiIdAuthParamsHelper()
            .setAccessToken()
            .setScopeList(HEALTH_SCOPES.map { Scope(it) })
            .createParams()
            .apply {
                // Attach Health Kit options as extended params
                signInParams = hiHealthOptions.toString()
            }
    }

    /**
     * Authorize Health Kit using v5 APIs.
     */
    suspend fun authorizeHealthKit(activity: Activity): Pair<Boolean, String> =
        suspendCancellableCoroutine { continuation ->
            try {
                val authService = HuaweiIdAuthManager.getService(activity, buildAuthParams())

                authService.silentSignIn()
                    .addOnSuccessListener { authHuaweiId: AuthHuaweiId ->
                        continuation.resume(Pair(true, "Health Kit authorization successful"))
                    }
                    .addOnFailureListener { e: Exception ->
                        // If silent sign-in fails, launch sign-in intent
                        try {
                            val signInIntent = authService.getSignInIntent(null)
                            activity.startActivityForResult(signInIntent, REQUEST_CODE_HEALTH_AUTH)
                            continuation.resume(Pair(false, "Health Kit authorization requires user interaction"))
                        } catch (ex: Exception) {
                            continuation.resume(
                                Pair(false, "Health Kit authorization failed: ${e.message}")
                            )
                        }
                    }
            } catch (e: Exception) {
                continuation.resumeWithException(e)
            }
        }

    /**
     * Check if Health Kit is authorized via silent sign-in.
     */
    fun isHealthKitAuthorized(): Boolean {
        return try {
            val authService = HuaweiIdAuthManager.getService(context, buildAuthParams())
            val task = authService.silentSignIn()
            com.huawei.hmf.tasks.Tasks.await(task)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Get the Huawei ID auth service.
     */
    fun getHuaweiIdAuthService(): HuaweiIdAuthService {
        return HuaweiIdAuthManager.getService(context, buildAuthParams())
    }

    /**
     * Get the authorized Huawei ID via silent sign-in.
     */
    suspend fun getAuthorizedHuaweiId(): AuthHuaweiId? =
        suspendCancellableCoroutine { continuation ->
            val authService = getHuaweiIdAuthService()
            authService.silentSignIn()
                .addOnSuccessListener { authHuaweiId: AuthHuaweiId -> continuation.resume(authHuaweiId) }
                .addOnFailureListener { e: Exception -> continuation.resumeWithException(e) }
        }
}
