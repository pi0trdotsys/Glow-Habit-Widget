package app.lovable.glow_habit_widget;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.PersistableBundle;

import org.json.JSONObject;

/**
 * The coach's comments: the day recap ("day") and Sunday's week ("week") go out at once with
 * the app's own text; this job (network required, may take a minute on a CPU-only server) asks
 * the coach server for a comment, keeps it in the app's recap history and, if the notification
 * is still on screen, swaps it in - silently.
 */
public class CoachJob extends JobService {
    private static final int JOB_DAY = 7272;
    private static final int JOB_WEEK = 7273;
    private static final int JOB_FORECAST = 7274;
    private Thread worker;

    /** `shown` = what goes into the notification under the comment, `rest` = the whole rest. */
    static void schedule(Context c, String kind, String title, String shown, String rest, String facts) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        int jobId = "week".equals(kind) ? JOB_WEEK : "forecast".equals(kind) ? JOB_FORECAST : JOB_DAY;
        PersistableBundle extras = new PersistableBundle();
        extras.putString("kind", kind);
        extras.putString("title", title);
        extras.putString("tip", shown);
        extras.putString("rest", rest);
        extras.putString("facts", facts);
        extras.putString("day", WidgetShared.today());
        ComponentName self = new ComponentName(c, CoachJob.class);
        // Android 12+: an expedited job starts right away, even under battery savers that hold
        // ordinary jobs back for a long time (HyperOS). Older / refused: a normal job with a deadline.
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            try {
                int r = js.schedule(new JobInfo.Builder(jobId, self)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setExpedited(true)
                    .setExtras(extras)
                    .build());
                if (r == JobScheduler.RESULT_SUCCESS) return;
            } catch (Exception ignored) {
            }
        }
        try {
            js.schedule(new JobInfo.Builder(jobId, self)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setOverrideDeadline(30 * 60 * 1000L) // no network within 30 min: run anyway, it fails quietly
                .setExtras(extras)
                .build());
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        final Context c = getApplicationContext();
        final PersistableBundle x = params.getExtras();
        worker = new Thread(() -> {
            try {
                // a recap from an earlier day isn't worth a comment any more
                if (WidgetShared.today().equals(x.getString("day", ""))) {
                    String text = CoachClient.comment(c, new JSONObject(x.getString("facts", "{}")));
                    if (text != null) deliver(c, x.getString("kind", "day"), x.getString("title", ""), text,
                        x.getString("tip", ""), x.getString("rest", ""));
                }
            } catch (Exception ignored) {
                // server off / offline / slow: the app's own text stays
            } finally {
                jobFinished(params, false);
            }
        }, "szpila-coach");
        worker.start();
        return true;
    }

    /** The comment to where its kind goes (the job and the Settings test both end here). */
    static void deliver(Context c, String kind, String title, String comment, String shown, String rest) {
        if ("week".equals(kind)) HabitNotifier.coachWeek(c, title, comment, shown, rest);
        else if ("forecast".equals(kind)) HabitNotifier.coachForecast(c, title, comment, shown);
        else HabitNotifier.coachSummary(c, title, comment, shown, rest);
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return false;
    }
}
