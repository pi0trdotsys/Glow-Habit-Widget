package app.lovable.glow_habit_widget

import android.content.Context
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.time.Instant

/**
 * Last night's sleep from Health Connect (SleepSessionRecord - Mi Fitness syncs
 * the Xiaomi band's sleep there). Same permission flow as HealthSteps (its
 * requestIntent asks for sleep too). Blocking - call off the main thread.
 * The picking/summing is pure Java in SleepCalc (unit-tested).
 */
object HealthSleep {
    @JvmField
    val READ_SLEEP = HealthPermission.getReadPermission(SleepSessionRecord::class)

    @JvmStatic
    fun granted(ctx: Context): Boolean = HealthSteps.hasPermission(ctx, READ_SLEEP)

    /**
     * The night filed under the day starting at `dayStart` (local midnight, ms):
     * the report's "sleep" object, or null (no permission / nothing synced yet).
     */
    @JvmStatic
    fun night(ctx: Context, dayStart: Long): JSONObject? {
        if (Build.VERSION.SDK_INT < 26 || !granted(ctx)) return null
        return try {
            val w = SleepCalc.window(dayStart)
            // A session that started before the window still counts: read from earlier, SleepCalc filters overlaps.
            val sessions = runBlocking { read(ctx, w[0] - 12 * SleepCalc.HOUR, w[1]) }
            SleepCalc.night(sessions, dayStart, SleepCalc.AUTO)?.let { SleepCalc.toJson(it) }
        } catch (_: Throwable) {
            null
        }
    }

    @androidx.annotation.RequiresApi(26)
    private suspend fun read(ctx: Context, from: Long, to: Long): List<SleepCalc.Session> {
        val client = HealthConnectClient.getOrCreate(ctx)
        val range = TimeRangeFilter.between(Instant.ofEpochMilli(from), Instant.ofEpochMilli(to))
        val out = ArrayList<SleepCalc.Session>()
        var token: String? = null
        var pages = 0
        do {
            val res = client.readRecords(
                ReadRecordsRequest(SleepSessionRecord::class, range, pageSize = 200, pageToken = token)
            )
            for (r in res.records) {
                val stages = r.stages.map {
                    SleepCalc.Stage(it.startTime.toEpochMilli(), it.endTime.toEpochMilli(), it.stage)
                }
                out.add(
                    SleepCalc.Session(
                        r.startTime.toEpochMilli(),
                        r.endTime.toEpochMilli(),
                        r.metadata.dataOrigin.packageName,
                        stages,
                    )
                )
            }
            token = res.pageToken
            pages++
        } while (token != null && pages < 3)
        return out
    }
}
