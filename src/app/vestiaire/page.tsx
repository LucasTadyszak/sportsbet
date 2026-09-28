import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CommandRun } from "@/generated/prisma/client";
import { API_PROVIDERS } from "@/lib/apiProviders";
import { latestRunByCommand, recentRuns, type RunSummary } from "@/lib/commandRuns";
import { COMMAND_IDS, COMMANDS, isCommandId } from "@/lib/commands";
import { formatKickoff } from "@/lib/dates";
import { formatAgo, formatDuration } from "@/lib/labels";
import { runStatus, type RunStatus } from "@/lib/runState";
import { Icon, type IconName } from "@/components/Icon";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageIntro } from "@/components/SiteHeader";
import { EmptyState } from "@/components/Verdict";
import { vestiaireAccess } from "./access";
import { CommandCard } from "./CommandCard";
import { LockScreen, VestiaireShell } from "./Shell";
import { TerminalOutput } from "./TerminalOutput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vestiaire — SportsBet", robots: { index: false, follow: false } };

/** While a run is going, the page re-reads its output this often. */
const RUNNING_REFRESH_MS = 1_500;

const STATUS_STYLE: Record<RunStatus, { dot: string; icon: IconName; label: string }> = {
  running: { dot: "bg-accent animate-pulse", icon: "loader", label: "En cours" },
  succeeded: { dot: "bg-status-good", icon: "check", label: "Réussie" },
  failed: { dot: "bg-status-critical", icon: "x", label: "Échec" },
  interrupted: { dot: "bg-status-warning", icon: "alert-triangle", label: "Interrompue" },
};

/** Status is never color alone: a dot, an icon and a word. */
function RunStatusPill({ status }: { status: RunStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
      <Icon name={style.icon} className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {style.label}
    </span>
  );
}

/** When the run stopped: its end, its last heartbeat if it was cut off, now if it's going. */
function endOf(run: Pick<CommandRun, "finishedAt" | "heartbeatAt">, status: RunStatus, now: Date): Date {
  return run.finishedAt ?? (status === "interrupted" ? run.heartbeatAt : now);
}

function lastRunLabel(run: RunSummary | undefined, now: Date): string | null {
  if (!run) return null;
  const status = runStatus(run, now);
  if (status === "running") return null;
  return `${STATUS_STYLE[status].label} · ${formatAgo(endOf(run, status, now), now)}`;
}

function RunItem({ run, open, now }: { run: CommandRun; open: boolean; now: Date }) {
  const status = runStatus(run, now);
  const npm = isCommandId(run.command) ? COMMANDS[run.command].npm : run.command;
  return (
    <li>
      <details open={open} className="group rounded-xl border border-border bg-bg-elevated shadow-card">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-bg-row/50 [&::-webkit-details-marker]:hidden">
          <RunStatusPill status={status} />
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{[npm, run.args].filter(Boolean).join(" ")}</code>
          <span className="flex items-center gap-3 text-xs text-fg-muted">
            <span>{formatKickoff(run.startedAt)}</span>
            <span className="font-mono-tabular">{formatDuration(endOf(run, status, now).getTime() - run.startedAt.getTime())}</span>
            <Icon name="chevron-down" className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
          </span>
        </summary>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <TerminalOutput
            text={run.output}
            follow={status === "running"}
            empty={status === "running" ? "En attente de la première ligne…" : "Aucune sortie."}
          />
          {status === "interrupted" ? (
            <p className="text-xs text-fg-muted">
              Le serveur s&apos;est arrêté pendant l&apos;exécution (redémarrage ou déploiement) : ce qui a été enregistré avant
              reste en base, relance la commande pour finir.
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export default async function VestiairePage() {
  const access = await vestiaireAccess();
  if (access === "hidden") notFound();
  if (access === "knocked") return <LockScreen />;

  const now = new Date();
  const [runs, latest] = await Promise.all([recentRuns(), latestRunByCommand()]);
  const isRunning = (run: RunSummary | undefined) => run !== undefined && runStatus(run, now) === "running";
  const anyRunning = runs.some((run) => isRunning(run));

  return (
    <VestiaireShell active="commands">
      {anyRunning ? <LiveRefresh everyMs={RUNNING_REFRESH_MS} /> : null}
      <PageIntro title="Commandes">
        Les scripts npm du site, exécutés sur le serveur : chaque bouton fait exactement ce que fait sa commande dans un
        terminal, et sa sortie s&apos;affiche plus bas en direct. Une commande ne tourne qu&apos;une fois à la fois, mais plusieurs
        commandes peuvent tourner ensemble.
      </PageIntro>

      <section aria-labelledby="commands-title" className="flex flex-col gap-3">
        <h2 id="commands-title" className="sr-only">
          Commandes disponibles
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMAND_IDS.map((id) => {
            const command = COMMANDS[id];
            return (
              <CommandCard
                key={id}
                id={id}
                npm={command.npm}
                title={command.title}
                description={command.description}
                apis={command.apis.map((api) => API_PROVIDERS[api].name)}
                args={command.args}
                running={isRunning(latest.get(id))}
                lastRun={lastRunLabel(latest.get(id), now)}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="runs-title" className="flex flex-col gap-3">
        <h2 id="runs-title" className="flex items-center gap-2.5 font-display text-lg font-semibold text-fg">
          <span className="h-5 w-1 rounded-full bg-fg-muted" aria-hidden />
          Exécutions
        </h2>
        {runs.length === 0 ? (
          <EmptyState title="Aucune exécution pour l'instant" icon="terminal">
            Lance une commande : sa sortie s&apos;affichera ici, ligne par ligne. L&apos;historique garde 30 jours.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run, i) => (
              <RunItem key={run.id} run={run} open={i === 0 || runStatus(run, now) === "running"} now={now} />
            ))}
          </ul>
        )}
      </section>
    </VestiaireShell>
  );
}
