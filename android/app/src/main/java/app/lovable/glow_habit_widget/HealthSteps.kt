package app.lovable.glow_habit_widget

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Today's step count from Health Connect (fed by Mi Fitness, Google Fit,
 * Samsung Health, Garmin, ...). Blocking helpers for Java callers - call them
 * off the main thread (plugin thread / NotifierReceiver's background thread).
 *
 * Several apps may write steps (a band via Mi Fitness, the phone, a ring).
 * The source is picked in the app (snapshot "stepsSource"): "auto" takes the
 * best of Health Connect's de-duplicated total and each source on its own
 * (StepsPick.auto); a package name reads only that app.
 */
object HealthSteps {
    private val READ_STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private const val READ_BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    /** Mi Fitness (Xiaomi Smart Band / Watch): syncs the band to Health Connect. */
    const val MI_FITNESS = "com.xiaomi.wearable"

    /** Apps that sync a wearable - opening one makes the band push fresh steps. First installed wins. */
    @JvmField
    val WEARABLE_APPS = listOf(
        MI_FITNESS,
        "com.xiaomi.hm.health",
        "com.mi.healthglobal",
        "com.garmin.android.apps.connectmobile",
        "com.fitbit.FitbitMobile",
        "com.samsung.android.app.health",
        "com.google.android.apps.fitness",
    )

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

    @androidx.annotation.RequiresApi(26)
    private fun todayRange(): TimeRangeFilter {
        val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
        return TimeRangeFilter.between(start, Instant.now())
    }

    /** The source picked in the app ("auto" when unset). */
    @JvmStatic
    fun source(ctx: Context): String = StepsPick.normalize(WidgetShared.state(ctx).optString("stepsSource", ""))

    /** Steps since local midnight from the chosen source, or -1 when unavailable / not permitted. */
    @JvmStatic
    fun today(ctx: Context): Long = today(ctx, source(ctx))

    @JvmStatic
    fun today(ctx: Context, source: String): Long {
        if (Build.VERSION.SDK_INT < 26 || !granted(ctx)) return -1
        return try {
            runBlocking {
                val range = todayRange()
                if (source != StepsPick.AUTO) {
                    aggregate(ctx, range, setOf(DataOrigin(source)))
                } else {
                    val total = aggregate(ctx, range, emptySet())
                    val perSource = origins(ctx, range).map { aggregate(ctx, range, setOf(DataOrigin(it))) }
                    StepsPick.auto(total, perSource)
                }
            }
        } catch (_: Throwable) {
            -1
        }
    }

    /** Today's count per writing app as [package, steps], most steps first (the source picker). */
    @JvmStatic
    fun sources(ctx: Context): List<Pair<String, Long>> {
        if (Build.VERSION.SDK_INT < 26 || !granted(ctx)) return emptyList()
        return try {
            runBlocking {
                val range = todayRange()
                origins(ctx, range).map { it to aggregate(ctx, range, setOf(DataOrigin(it))) }
                    .sortedByDescending { it.second }
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    /** The installed wearable app to open for a sync (Mi Fitness first), or null. */
    @JvmStatic
    fun wearableApp(ctx: Context): String? =
        WEARABLE_APPS.firstOrNull { ctx.packageManager.getLaunchIntentForPackage(it) != null }

    private suspend fun aggregate(ctx: Context, range: TimeRangeFilter, origins: Set<DataOrigin>): Long {
        val res = client(ctx).aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = range,
                dataOriginFilter = origins,
            )
        )
        return res[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /** Packages that wrote steps today (distinct; a few pages at most). */
    private suspend fun origins(ctx: Context, range: TimeRangeFilter): Set<String> {
        val out = linkedSetOf<String>()
        var token: String? = null
        var pages = 0
        do {
            val res = client(ctx).readRecords(
                ReadRecordsRequest(StepsRecord::class, range, pageSize = 1000, pageToken = token)
            )
            res.records.forEach { out.add(it.metadata.dataOrigin.packageName) }
            token = res.pageToken
            pages++
        } while (token != null && pages < 5)
        return out
    }
}
