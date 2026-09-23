import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HabitForm } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";

export const Route = createFileRoute("/habits/new")({
  head: () => ({ meta: [{ title: "Nowe zadanie - Loop" }] }),
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
        disabledReason={count >= MAX_HABITS ? `Osiągnięto limit ${MAX_HABITS} zadań.` : null}
      />
    </AppShell>
  );
}
