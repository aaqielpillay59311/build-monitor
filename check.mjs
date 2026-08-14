// Checks every URL in builds.json and writes status.json.
// Deliberately records failures. A monitor that only reports success is decoration.
//
// Run: node check.mjs
import { readFile, writeFile } from "node:fs/promises";

const TIMEOUT_MS = 20000;
const ATTEMPTS = 2;
const UA =
  "Mozilla/5.0 (compatible; build-monitor/1.0; +https://github.com/aaqielpillay59311/build-monitor)";

async function probe(url) {
  let last = { status: 0, error: "not attempted" };

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
    const started = Date.now();

    try {
      // GET, not HEAD. Some static hosts answer HEAD differently or not at all,
      // and the question being asked is "does a visitor get a page", not
      // "does the origin tolerate HEAD".
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: control.signal,
        headers: { "user-agent": UA, accept: "text/html,*/*" },
      });
      clearTimeout(timer);
      return {
        status: res.status,
        ms: Date.now() - started,
        ok: res.status === 200,
        attempts: attempt,
        error: null,
      };
    } catch (err) {
      clearTimeout(timer);
      last = {
        status: 0,
        ms: Date.now() - started,
        ok: false,
        attempts: attempt,
        error: err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err.message || err),
      };
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return last;
}

const builds = JSON.parse(await readFile(new URL("./builds.json", import.meta.url), "utf8"));

// Concurrency cap of 6. Enough to finish fast, low enough not to look like a burst.
const results = new Array(builds.length);
let cursor = 0;
async function worker() {
  while (cursor < builds.length) {
    const i = cursor++;
    const b = builds[i];
    const r = await probe(b.url);
    results[i] = { n: b.n, host: b.host, url: b.url, ...r };
    console.log(
      `${String(b.n).padStart(2, "0")}  ${r.ok ? "OK  " : "DOWN"}  ${String(r.status).padStart(3)}  ${String(r.ms).padStart(5)}ms  ${b.host}${r.error ? "  " + r.error : ""}`
    );
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const ok = results.filter((r) => r.ok).length;
const latencies = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;

const status = {
  checked_at: new Date().toISOString(),
  source: "https://github.com/aaqielpillay59311/build-monitor",
  method: "HTTP GET, redirects followed, 20s timeout, 2 attempts before a URL is called down",
  summary: {
    total: results.length,
    ok,
    down: results.length - ok,
    all_ok: ok === results.length,
    median_ms_of_passing: median,
  },
  results,
};

await writeFile(new URL("./status.json", import.meta.url), JSON.stringify(status, null, 2) + "\n");

console.log(`\n${ok} of ${results.length} returning 200. median ${median}ms.`);
// Exit 0 even when something is down. A red status is a true result, not a broken job.
