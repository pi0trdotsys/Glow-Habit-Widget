// The phone's calendars through the HabitWidget plugin (Android only; no-ops on
// web). Today's instances of the picked calendars are kept in a small
// in-memory store so the Today screen and Settings share one read.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect } from "react";
import { create } from "zustand";
import { useHabits } from "@/lib/habits/store";
import { minuteOfDay, type PlanItem } from "@/lib/habits/utils";
import {
  avoidBusy,
  busyIntervals,
  matchWindow,
  toEvents,
  untilMinute,
  type CalEvent,
  type DeviceCalendar,
  type Interval,
  type RawEvent,
  type WindowMatch,
} from "@/lib/calendar";

interface CalendarPlugin {
  calendarStatus(): Promise<{ granted: boolean }>;
  requestCalendar(): Promise<{ granted: boolean }>;
  calendarList(): Promise<{ granted: boolean; calendars: DeviceCalendar[] }>;
  calendarEvents(opts: {
    ids: string[];
    fromMs: number;
    toMs: number;
  }): Promise<{ granted: boolean; events: RawEvent[] }>;
  openCalendarApp(): Promise<void>;
}
const Native = registerPlugin<CalendarPlugin>("HabitWidget");

const isNative = () => Capacitor.isNativePlatform();

export async function calendarGranted(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await Native.calendarStatus()).granted;
  } catch {
    return false;
  }
}

/** The system permission dialog. */
export async function requestCalendar(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await Native.requestCalendar()).granted;
  } catch {
    return false;
  }
}

export async function listCalendars(): Promise<DeviceCalendar[]> {
  if (!isNative()) return [];
  try {
    return (await Native.calendarList()).calendars ?? [];
  } catch {
    return [];
  }
}

export async function openCalendarApp(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Native.openCalendarApp();
    return true;
  } catch {
    return false;
  }
}

function midnightOf(d: Date): number {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m.getTime();
}

interface CalendarDay {
  /** Local midnight (ms) the minutes are counted from. */
  midnight: number;
  /** Today + tomorrow's instances in minutes from midnight. */
  events: CalEvent[];
  /** Ids the events were read for ("" = nothing read). */
  key: string;
  loadedAt: number;
}

export const useCalendarDay = create<CalendarDay>(() => ({
  midnight: 0,
  events: [],
  key: "",
  loadedAt: 0,
}));

/** Read today's and tomorrow's instances of the picked calendars. */
export async function refreshCalendar(now: Date = new Date()): Promise<void> {
  const ids = useHabits.getState().calendars;
  const midnight = midnightOf(now);
  if (!isNative() || ids.length === 0) {
    useCalendarDay.setState({ midnight, events: [], key: "", loadedAt: Date.now() });
    return;
  }
  try {
    const r = await Native.calendarEvents({
      ids,
      fromMs: midnight,
      toMs: midnight + 2 * 86_400_000,
    });
    useCalendarDay.setState({
      midnight,
      events: toEvents(r.events ?? [], midnight),
      key: ids.join(","),
      loadedAt: Date.now(),
    });
  } catch {
    // plugin missing (old native build) - keep what we have
  }
}

/** Busy intervals of today (minutes from midnight); refreshed on open, every 5 min and on return. */
export function useBusyToday(): { busy: Interval[]; events: CalEvent[] } {
  const ids = useHabits((s) => s.calendars);
  const events = useCalendarDay((s) => s.events);
  const midnight = useCalendarDay((s) => s.midnight);
  const readFor = useCalendarDay((s) => s.key);
  const key = ids.join(",");
  useEffect(() => {
    if (!isNative()) return;
    void refreshCalendar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCalendar();
    }, 5 * 60_000);
    const onVis = () => document.visibilityState === "visible" && void refreshCalendar();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [key]);
  // A new day: the minutes are relative to a stale midnight until the next read.
  const fresh = midnight === midnightOf(new Date()) && key !== "" && readFor === key;
  const list = fresh ? events : [];
  return { busy: busyIntervals(list), events: list };
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Today screen + the phone's calendars ("Podpowiadaj wolne okna"): plan times
 * moved out of meetings, and the next free window that fits a minutes habit.
 * Without picked calendars (or on the web) the plan comes back unchanged.
 */
export function useCalendarPlan(
  plan: PlanItem[],
  now: Date,
): { plan: PlanItem[]; match: WindowMatch | null } {
  const { busy } = useBusyToday();
  const on = useHabits((s) => s.notifications.freeWindows);
  const quietFrom = useHabits((s) => s.notifications.quietFrom);
  const quietTo = useHabits((s) => s.notifications.quietTo);
  if (!on || busy.length === 0) return { plan, match: null };
  const nowMin = minuteOfDay(now);
  return {
    plan: avoidBusy(plan, busy, nowMin),
    match: matchWindow(plan, busy, nowMin, untilMinute(toMin(quietFrom), toMin(quietTo))),
  };
}
