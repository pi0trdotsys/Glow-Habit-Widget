// In-memory localStorage so the persisted zustand store works (quietly) under bun test.
const mem = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;
// zustand reads window.localStorage.
(globalThis as { window?: unknown }).window ??= globalThis;
