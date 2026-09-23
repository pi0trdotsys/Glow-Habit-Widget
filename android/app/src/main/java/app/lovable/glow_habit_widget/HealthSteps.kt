package app.lovable.glow_habit_widget

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import java.time.LocalDate
import java.time.ZoneId
import java.time.Instant

/**
 * Today's step count from Health Connect (fed by Google Fit, Samsung Health,
 * Mi Fitness, ...). Blocking helpers for Java callers - call them off the
 * main thread (plugin thread / NotifierReceiver's background thread).
 */
object HealthSteps {
    private val READ_STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private const val READ_BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    @JvmStatic
    fun available(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= 26 &&
            HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    private fun client(ctx: Context) = HealthConnectClient.getOrCreate(ctx)

    /** Permissions to request: steps, plus background reads (widgets/notifications) when supported. */
    @JvmStatic
    fun permissions(ctx: Context): Set<String> {
        val perms = mutableSetOf(READ_STEPS)
        try {
            val f = client(ctx).features
            if (f.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
                HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
            ) perms.add(READ_BACKGROUND)
        } catch (_: Throwable) {
        }
        return perms
    }

    @JvmStatic
    fun requestIntent(ctx: Context): Intent =
        PermissionController.createRequestPermissionResultContract().createIntent(ctx, permissions(ctx))

    @JvmStatic
    fun granted(ctx: Context): Boolean = hasPermission(ctx, READ_STEPS)

    @JvmStatic
    fun backgroundGranted(ctx: Context): Boolean = hasPermission(ctx, READ_BACKGROUND)

    private fun hasPermission(ctx: Context, p: String): Boolean {
        if (!available(ctx)) return false
        return try {
            runBlocking { client(ctx).permissionController.getGrantedPermissions().contains(p) }
        } catch (_: Throwable) {
            false
        }
    }

    /** Steps since local midnight, or -1 when unavailable / not permitted. */
    @JvmStatic
    fun today(ctx: Context): Long {
        if (Build.VERSION.SDK_INT < 26 || !granted(ctx)) return -1
        return try {
            val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
            runBlocking {
                val res = client(ctx).aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(start, Instant.now()),
                    )
                )
                res[StepsRecord.COUNT_TOTAL] ?: 0L
            }
        } catch (_: Throwable) {
            -1
        }
    }
}
