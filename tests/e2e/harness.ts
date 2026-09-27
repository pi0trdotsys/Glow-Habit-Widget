// Minimal E2E harness: serves the static Capacitor build (dist/client), seeds
// demo data into localStorage, and drives headless Microsoft Edge / Chrome via
// the DevTools protocol. No extra dependencies. Run: bun run test:e2e
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist", "client");
const PORT = 4399;
const CDP = 9399;

const BROWSERS = [
  process.env.E2E_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean) as string[];

const TYPES: Record<string, string> = {
  js: "text/javascript",
  css: "text/css",
  html: "text/html",
  png: "image/png",
  svg: "image/svg+xml",
  json: "application/json",
  webmanifest: "application/manifest+json",
  woff2: "font/woff2",
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The parts of a DevTools protocol response the tests use. */
export interface CdpResponse {
  result?: { value?: unknown };
  exceptionDetails?: { exception?: { description?: string } };
  data?: string;
  error?: unknown;
}

export interface Page {
  send: (method: string, params?: object) => Promise<CdpResponse>;
  eval: <T = unknown>(expression: string) => Promise<T>;
  goto: (path: string) => Promise<void>;
  waitFor: (expression: string, timeoutMs?: number) => Promise<number>;
  close: () => void;
}

export async function launch(preload: string): Promise<Page> {
  if (!existsSync(join(DIST, "index.html")))
    throw new Error("Brak dist/client - uruchom najpierw: bun run build:cap");
  const browser = BROWSERS.find((b) => existsSync(b));
  if (!browser) throw new Error("Nie znaleziono Edge/Chrome - ustaw E2E_BROWSER");

  const server = Bun.serve({
    port: PORT,
    fetch(req) {
      const p = decodeURIComponent(new URL(req.url).pathname);
      let f = join(DIST, p);
      if (!p.includes(".") || !existsSync(f)) f = join(DIST, "index.html");
      return new Response(readFileSync(f), {
        headers: { "content-type": TYPES[f.split(".").pop()!] ?? "application/octet-stream" },
      });
    },
  });
  const proc: ChildProcess = spawn(browser, [
    "--headless=new",
    `--remote-debugging-port=${CDP}`,
    "--no-first-run",
    "--disable-gpu",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "loop-e2e-"))}`,
    "about:blank",
  ]);

  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 60 && !targets.some((t) => t.type === "page"); i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: CdpResponse) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) pending.get(m.id)!(m.result ?? { error: m.error });
  };
  const send = (method: string, params: object = {}) =>
    new Promise<CdpResponse>((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: preload });

  const evaluate = async <T>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(`${expression}\n${r.exceptionDetails.exception?.description}`);
    return r.result?.value as T;
  };

  return {
    send,
    eval: evaluate,
    goto: async (path) => {
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}${path}` });
    },
    /** Poll a boolean expression; resolves with the elapsed ms or throws on timeout. */
    waitFor: async (expression, timeoutMs = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await evaluate<boolean>(expression).catch(() => false)) return Date.now() - start;
        await sleep(50);
      }
      throw new Error(`Timeout: ${expression}`);
    },
    close: () => {
      ws.close();
      proc.kill();
      server.stop(true);
    },
  };
}

// ---------------------------------------------------------------- tiny runner

let failed = 0;
export async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").join("\n    ")}`);
  }
}

export function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function finish(): never {
  console.log(failed ? `\n${failed} E2E test(s) failed` : "\nAll E2E tests passed");
  process.exit(failed ? 1 : 0);
}
