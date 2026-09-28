// Runs the hidden console's commands (src/lib/commands.ts, /vestiaire) in the web server's
// background, one run of a command at a time, each recorded in CommandRun with its output as it
// goes: the console page re-reads it every couple of seconds while something runs.
import type { CommandRun, Prisma } from "@/generated/prisma/client";
import { COMMANDS, type CommandId } from "@/lib/commands";
import { prisma } from "@/lib/prisma";
import { describeError, outputBuffer, STALE_RUN_MS } from "@/lib/runState";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How often a run's new output is written. */
const FLUSH_MS = 1_000;
/** How often a run's heartbeat is written when it has no new output. */
const HEARTBEAT_MS = 10_000;
/** Runs older than this are deleted when a new one starts. */
const RETENTION_DAYS = 30;

/**
 * Starts a run of the command unless one is going already (a double click, a second tab): the run
 * that is going, and whether this call started it. Under an advisory lock, so two clicks can't both
 * start one.
 */
export async function claimRun(command: CommandId, args: string[]): Promise<{ id: string; started: boolean }> {
  await prisma.commandRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RETENTION_DAYS * DAY_MS) } } });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`command-run:${command}`}))`;
    const going = await tx.commandRun.findFirst({
      where: { command, status: "running", heartbeatAt: { gt: new Date(Date.now() - STALE_RUN_MS) } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (going) return { id: going.id, started: false };
    const run = await tx.commandRun.create({
      data: { command, args: args.length > 0 ? args.join(" ") : null, status: "running" },
      select: { id: true },
    });
    return { id: run.id, started: true };
  });
}

/** Runs a claimed run to its end, writing its output and heartbeat as it goes. Never throws. */
export async function executeRun(id: string, command: CommandId, args: string[]): Promise<void> {
  const { npm } = COMMANDS[command];
  console.log(`vestiaire: ${[npm, ...args].join(" ")} started`);
  const output = outputBuffer();
  // Writes go one after the other: an older output never lands over a newer one.
  let writing: Promise<unknown> = Promise.resolve();
  const write = (data: Prisma.CommandRunUpdateInput) => {
    writing = writing
      .then(() => prisma.commandRun.update({ where: { id }, data }))
      .catch((err) => console.error(`vestiaire: run ${id} not saved:`, err));
    return writing;
  };
  let written = "";
  let beatAt = Date.now();
  const timer = setInterval(() => {
    const text = output.toString();
    if (text === written && Date.now() - beatAt < HEARTBEAT_MS) return;
    written = text;
    beatAt = Date.now();
    void write({ output: text, heartbeatAt: new Date(beatAt) });
  }, FLUSH_MS);

  let failed = true;
  try {
    failed = await COMMANDS[command].run(output.push, args);
  } catch (err) {
    output.push(describeError(err));
  } finally {
    clearInterval(timer);
  }
  const now = new Date();
  await write({ status: failed ? "failed" : "succeeded", output: output.toString(), heartbeatAt: now, finishedAt: now });
  console.log(`vestiaire: ${npm} ${failed ? "failed" : "done"}`);
}

/** The latest runs, newest first. */
export function recentRuns(take = 12): Promise<CommandRun[]> {
  return prisma.commandRun.findMany({ orderBy: { startedAt: "desc" }, take });
}

export type RunSummary = Pick<CommandRun, "id" | "command" | "status" | "startedAt" | "heartbeatAt" | "finishedAt">;

/** Each command's latest run, without its output, by command. */
export async function latestRunByCommand(): Promise<Map<string, RunSummary>> {
  const runs = await prisma.commandRun.findMany({
    distinct: ["command"],
    orderBy: { startedAt: "desc" },
    select: { id: true, command: true, status: true, startedAt: true, heartbeatAt: true, finishedAt: true },
  });
  return new Map(runs.map((run) => [run.command, run]));
}
