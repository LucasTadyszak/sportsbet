import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, outputBuffer, runStatus, STALE_RUN_MS } from "@/lib/runState";

const NOW = new Date("2026-09-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("a running run whose heartbeat stopped was interrupted", () => {
  assert.equal(runStatus({ status: "running", heartbeatAt: ago(5_000) }, NOW), "running");
  assert.equal(runStatus({ status: "running", heartbeatAt: ago(STALE_RUN_MS) }, NOW), "running");
  assert.equal(runStatus({ status: "running", heartbeatAt: ago(STALE_RUN_MS + 1) }, NOW), "interrupted");
  // A finished run is what it says, however old.
  assert.equal(runStatus({ status: "succeeded", heartbeatAt: ago(10 * STALE_RUN_MS) }, NOW), "succeeded");
  assert.equal(runStatus({ status: "failed", heartbeatAt: ago(10 * STALE_RUN_MS) }, NOW), "failed");
});

test("the output keeps its lines up to its cap, then only counts them", () => {
  const output = outputBuffer(12);
  assert.equal(output.toString(), "");
  output.push("12345");
  output.push("67890");
  assert.equal(output.toString(), "12345\n67890");
  output.push("x");
  output.push("y");
  assert.equal(output.toString(), "12345\n67890\n… 2 lignes de plus, non conservées");
  // Once a line is dropped, the ones after it are too: the output never has holes.
  const one = outputBuffer(5);
  one.push("123456");
  one.push("1");
  assert.equal(one.toString(), "\n… 2 lignes de plus, non conservées");
  const single = outputBuffer(5);
  single.push("ok");
  single.push("too long");
  assert.equal(single.toString(), "ok\n… 1 ligne de plus, non conservée");
});

test("an error shows its message and the site's own frames, not Next's or Node's", () => {
  const err = new Error("RAPIDAPI_KEY is not set");
  err.stack = [
    "Error: RAPIDAPI_KEY is not set",
    "    at apiKey (webpack-internal:///(rsc)/./src/lib/liveFootballApi.ts:33:21)",
    "    at /app/node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js:52:50711",
    "    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:91:14)",
    "    at executeRun (webpack-internal:///(rsc)/./src/lib/commandRuns.ts:126:85)",
  ].join("\n");
  assert.equal(
    describeError(err),
    [
      "Error: RAPIDAPI_KEY is not set",
      "    at apiKey (webpack-internal:///(rsc)/./src/lib/liveFootballApi.ts:33:21)",
      "    at executeRun (webpack-internal:///(rsc)/./src/lib/commandRuns.ts:126:85)",
    ].join("\n")
  );
  assert.equal(describeError("plain"), "plain");
  assert.equal(describeError(new TypeError("bad")).split("\n")[0], "TypeError: bad");
});
