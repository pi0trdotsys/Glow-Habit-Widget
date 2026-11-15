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
 * "Podsumowanie dnia" with the coach: the recap goes out at once with the app's own opener;
 * this job (network required, may take a minute on a CPU-only server) asks the coach server
 * for a comment and, if the recap is still on screen, swaps the opener for it - silently.
 */
public class CoachJob extends JobService {
    private static final int JOB_ID = 7272;
    private Thread worker;

    static void schedule(Context c, String title, String rest, String facts) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        PersistableBundle extras = new PersistableBundle();
        extras.putString("title", title);
        extras.putString("rest", rest);
        extras.putString("facts", facts);
        extras.putString("day", WidgetShared.today());
        ComponentName self = new ComponentName(c, CoachJob.class);
        // Android 12+: an expedited job starts right away, even under battery savers that hold
        // ordinary jobs back for a long time (HyperOS). Older / refused: a normal job with a deadline.
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            try {
                int r = js.schedule(new JobInfo.Builder(JOB_ID, self)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setExpedited(true)
                    .setExtras(extras)
                    .build());
                if (r == JobScheduler.RESULT_SUCCESS) return;
            } catch (Exception ignored) {
            }
        }
        try {
            js.schedule(new JobInfo.Builder(JOB_ID, self)
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
                    if (text != null) HabitNotifier.coachSummary(c, x.getString("title", ""), text, x.getString("rest", ""));
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

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return false;
    }
}
