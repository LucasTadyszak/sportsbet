// What a console run's row means (CommandRun, src/lib/commandRuns.ts): its status — interrupted when
// its heartbeat stopped — its output as it is kept, and an error as the run shows it. Pure, so it
// can be tested without a database.

/** A run still marked running without a heartbeat for this long was cut off (the server stopped under it). */
export const STALE_RUN_MS = 60_000;
/** Output kept per run — a raw endpoint payload can run into megabytes: the lines past it are only counted. */
export const MAX_OUTPUT_CHARS = 60_000;

export type RunStatus = "running" | "succeeded" | "failed" | "interrupted";

/** What the run's row says, except that a run whose heartbeat stopped was interrupted. */
export function runStatus(run: { status: string; heartbeatAt: Date }, now = new Date()): RunStatus {
  if (run.status === "running") return now.getTime() - run.heartbeatAt.getTime() > STALE_RUN_MS ? "interrupted" : "running";
  return run.status === "failed" ? "failed" : "succeeded";
}

/** A run's output, a line at a time, up to `max` characters: the lines past that are only counted. */
export function outputBuffer(max = MAX_OUTPUT_CHARS) {
  let text = "";
  let dropped = 0;
  return {
    push(line: string) {
      if (dropped > 0 || text.length + line.length + 1 > max) dropped++;
      else text = text ? `${text}\n${line}` : line;
    },
    toString(): string {
      return dropped > 0 ? `${text}\n… ${dropped} ligne${dropped > 1 ? "s" : ""} de plus, non conservée${dropped > 1 ? "s" : ""}` : text;
    },
  };
}

/** An error as a run shows it: its message, then where it came from in the site's own code (not Next's or Node's). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const frames = (err.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line) && !/node_modules|node:/.test(line));
  return [`${err.name}: ${err.message}`, ...frames.slice(0, 6)].join("\n");
}
