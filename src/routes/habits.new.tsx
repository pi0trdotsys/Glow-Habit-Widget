import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HabitForm } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";
import { L } from "@/lib/i18n";

export const Route = createFileRoute("/habits/new")({
  head: () => ({ meta: [{ title: L("Nowe zadanie - Szpila", "New habit - Szpila") }] }),
  component: NewHabit,
});

const MAX_HABITS = 24;

function NewHabit() {
  const navigate = useNavigate();
  const addHabit = useHabits((s) => s.addHabit);
  const count = useHabits((s) => s.habits.length);

  return (
    <AppShell>
      <HabitForm
        onCancel={() => navigate({ to: "/habits" })}
        onSave={(draft) => {
          addHabit(draft);
          navigate({ to: "/" });
        }}
        disabledReason={
          count >= MAX_HABITS
            ? L(
                `Osiągnięto limit ${MAX_HABITS} zadań.`,
                `You've hit the limit of ${MAX_HABITS} habits.`,
              )
            : null
        }
      />
    </AppShell>
  );
}
