package app.lovable.glow_habit_widget;

import java.util.List;

/** Pure step-source logic (HealthSteps), unit-tested in StepsPickTest. */
final class StepsPick {
    static final String AUTO = "auto";

    private StepsPick() {}

    /**
     * "auto": Health Connect's de-duplicated total, unless one source alone
     * counted more (the total follows the app priority set in Health Connect,
     * which may put the phone ahead of the band that was on the wrist all day).
     */
    static long auto(long total, List<Long> perSource) {
        long best = Math.max(0, total);
        if (perSource != null) for (Long s : perSource) if (s != null && s > best) best = s;
        return best;
    }

    /** The stored source setting, "auto" for anything empty. */
    static String normalize(String source) {
        return source == null || source.trim().isEmpty() ? AUTO : source.trim();
    }
}
