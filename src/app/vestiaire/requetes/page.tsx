import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { ApiUsageLog } from "@/generated/prisma/client";
import { API_PROVIDERS, apiProviderName, isApiProvider } from "@/lib/apiProviders";
import { getUsageDashboard, perMinuteLimit, type ProviderUsage, type QuotaReading, type UsageDashboard } from "@/lib/apiUsage";
import { formatAgo, formatCount } from "@/lib/labels";
import { isUsagePeriod, USAGE_PERIODS, type UsagePeriod } from "@/lib/usagePeriods";
import { Icon } from "@/components/Icon";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageIntro } from "@/components/SiteHeader";
import { Straight, slantTabClass } from "@/components/Slant";
import { vestiaireAccess } from "../access";
import { LockScreen, VestiaireShell } from "../Shell";
import { bucketLabel, UsageBars } from "./UsageBars";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Requêtes API — Vestiaire", robots: { index: false, follow: false } };

// The counters move with every call: the page re-reads them this often while it's in view.
const REFRESH_MS = 30_000;

// Calls come in bursts: to the second.
const CALL_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2.5 font-display text-2xl uppercase leading-none tracking-wide text-fg">
          <span className="h-5 w-2 shrink-0 -skew-x-12 bg-slate" aria-hidden />
          {title}
        </h2>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A count against a limit. The fill says how close it is (blue, then warning, then critical) and
 * a word says it too: never color alone.
 */
function Meter({ label, used, limit, detail }: { label: string; used: number; limit: number; detail?: string }) {
  const share = limit > 0 ? Math.min(1, used / limit) : 0;
  const level = share >= 0.9 ? "critical" : share >= 0.7 ? "warning" : "ok";
  const fill = level === "critical" ? "bg-status-critical" : level === "warning" ? "bg-status-warning" : "bg-series-1";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-fg">{label}</span>
        <span className="figures text-fg">
          {formatCount(used)} <span className="text-fg-muted">/ {formatCount(limit)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        className="h-2.5 overflow-hidden bg-seq-1"
      >
        <div className={`h-full ${fill}`} style={{ width: `${share * 100}%` }} />
      </div>
      {level !== "ok" || detail ? (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          {level !== "ok" ? (
            <>
              <Icon name="alert-triangle" className={`h-3.5 w-3.5 ${level === "critical" ? "text-status-critical" : "text-fg"}`} />
              <span className="font-medium text-fg">{level === "critical" ? "Limite presque atteinte" : "Proche de la limite"}</span>
              {detail ? <span aria-hidden>·</span> : null}
            </>
          ) : null}
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function quotaMeter(label: string, reading: QuotaReading | null, now: Date) {
  return reading ? (
    <Meter label={label} used={reading.used} limit={reading.used + reading.remaining} detail={`relevé ${formatAgo(reading.at, now)}`} />
  ) : (
    <p className="text-xs text-fg-muted">{label} : pas encore de relevé.</p>
  );
}

/** Where each provider stands right now against its limit(s). */
function ProviderNow({ usage, dashboard, now }: { usage: ProviderUsage; dashboard: UsageDashboard; now: Date }) {
  const { provider } = usage;
  const perMinute = perMinuteLimit(provider);
  let meters: ReactNode;
  if (provider === "free-api-live-football-data") {
    meters = (
      <>
        {dashboard.liveHourlyCap ? (
          <Meter label="Plafond du site, heure glissante" used={dashboard.liveHourlyCap.used} limit={dashboard.liveHourlyCap.limit} />
        ) : (
          <p className="text-xs text-fg-muted">Plafond horaire illisible : vérifie LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR.</p>
        )}
        {quotaMeter("Quota du plan RapidAPI", dashboard.rapidApiQuota, now)}
      </>
    );
  } else if (provider === "the-odds-api") {
    meters = quotaMeter("Crédits du mois", dashboard.oddsApiCredits, now);
  } else if (perMinute !== null) {
    meters = <Meter label="Dernière minute" used={usage.lastMinute} limit={perMinute} />;
  } else {
    meters = <p className="text-xs text-fg-muted">Pas de quota à surveiller.</p>;
  }
  return (
    <div className="flex flex-col gap-3 border-t-4 border-slate bg-bg-elevated p-4 shadow-hard">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-xl uppercase leading-tight tracking-wide text-fg">{apiProviderName(provider)}</h3>
        {isApiProvider(provider) ? <p className="text-xs text-fg-muted">{API_PROVIDERS[provider].role}</p> : null}
      </div>
      <div className="flex flex-col gap-3">{meters}</div>
      <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-fg-muted">
        <span>
          <span className="figures font-semibold text-fg">{formatCount(usage.lastHour)}</span> sur la dernière heure
        </span>
        <span>{usage.lastCallAt ? `dernier appel ${formatAgo(usage.lastCallAt, now)}` : "aucun appel enregistré"}</span>
      </p>
    </div>
  );
}

function PeriodPicker({ period }: { period: UsagePeriod }) {
  return (
    <nav aria-label="Période" className="flex w-fit gap-1 bg-bg-deep px-3 py-1.5">
      {(Object.keys(USAGE_PERIODS) as UsagePeriod[]).map((key) => (
        <Link
          key={key}
          href={{ pathname: "/vestiaire/requetes", query: key === "24h" ? {} : { periode: key } }}
          aria-current={key === period ? "page" : undefined}
          className={slantTabClass(key === period, "sm")}
        >
          <Straight>{USAGE_PERIODS[key].label}</Straight>
        </Link>
      ))}
    </nav>
  );
}

function Table({ head, children, minWidth = 560 }: { head: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto bg-bg-elevated shadow-hard">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead className="bg-bg-deep">
          <tr className="text-left font-cond text-xs font-bold uppercase tracking-widest text-fg-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 font-bold ${i === 0 ? "pl-4" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** What a call's response said about its plan's quota. */
function quotaNote(call: ApiUsageLog): string {
  if (call.provider === "the-odds-api" && call.requestsRemaining !== null) {
    return `${call.requestsLastCost !== null ? `coût ${call.requestsLastCost} · ` : ""}${formatCount(call.requestsRemaining)} crédits restants`;
  }
  if (call.provider === "free-api-live-football-data" && call.requestsRemaining !== null) return `${formatCount(call.requestsRemaining)} restantes (plan)`;
  if (call.provider === "football-data.org" && call.requestsRemaining !== null) return `${call.requestsRemaining} restantes cette minute`;
  return "—";
}

const perBucket = (total: number, buckets: number, unit: "hour" | "day") => {
  const average = total / buckets;
  return `≈ ${average >= 10 ? formatCount(Math.round(average)) : average.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / ${unit === "hour" ? "h" : "jour"}`;
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const access = await vestiaireAccess();
  if (access === "hidden") notFound();
  if (access === "knocked") return <LockScreen />;

  const { periode } = await searchParams;
  const period = isUsagePeriod(periode) ? periode : "24h";
  const now = new Date();
  const dashboard = await getUsageDashboard(period, now);
  const { unit, label: periodLabel } = USAGE_PERIODS[period];
  const grandTotal = dashboard.providers.reduce((sum, p) => sum + p.total, 0);

  return (
    <VestiaireShell active="requests">
      <LiveRefresh everyMs={REFRESH_MS} />
      <PageIntro title="Requêtes API">
        Chaque appel du site et de ses crons aux API externes, tel qu&apos;il est inscrit dans ApiUsageLog : où en est chaque quota,
        combien de requêtes partent, et vers quels endpoints. La page se met à jour toute seule.
      </PageIntro>

      <Section title="En ce moment" description="Chaque API face à sa limite, d'après les derniers appels et les en-têtes de quota qu'ils ont renvoyés.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard.providers.map((usage) => (
            <ProviderNow key={usage.provider} usage={usage} dashboard={dashboard} now={now} />
          ))}
        </div>
      </Section>

      <div className="flex flex-col gap-8 border-t border-border pt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PeriodPicker period={period} />
          <p className="text-sm text-fg-muted">
            <span className="figures font-semibold text-fg">{formatCount(grandTotal)}</span> requêtes sur {periodLabel}, toutes API
            confondues
          </p>
        </div>

        <Section
          title="Requêtes par API"
          description={`Par ${unit === "hour" ? "heure" : "jour"}, heure de Paris ; la dernière colonne est ${unit === "hour" ? "l'heure" : "la journée"} en cours. Chaque graphique a sa propre échelle : le chiffre au-dessus d'une colonne est le pic de la période.`}
        >
          <div className="flex flex-col divide-y divide-border bg-bg-elevated shadow-hard">
            {dashboard.providers.map((usage) => (
              <div key={usage.provider} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:gap-6">
                <div className="flex shrink-0 flex-col gap-0.5 sm:w-56">
                  <span className="font-cond text-sm font-bold uppercase tracking-wide text-fg">{apiProviderName(usage.provider)}</span>
                  <span className="font-display text-3xl leading-tight text-fg">{formatCount(usage.total)}</span>
                  <span className="text-xs text-fg-muted">
                    {usage.total > 0 ? perBucket(usage.total, dashboard.buckets.length, unit) : "aucune requête"}
                    {usage.credits ? ` · ${formatCount(usage.credits)} crédits` : ""}
                  </span>
                </div>
                {usage.total > 0 ? (
                  <UsageBars series={usage.series} buckets={dashboard.buckets} unit={unit} label={apiProviderName(usage.provider)} />
                ) : (
                  <p className="flex min-h-12 flex-1 items-center text-sm text-fg-muted">Aucune requête sur {periodLabel}.</p>
                )}
              </div>
            ))}
          </div>
          <details className="group bg-bg-elevated shadow-hard">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-cond text-base font-bold uppercase tracking-wide text-fg transition-colors duration-150 hover:bg-bg-row/60 [&::-webkit-details-marker]:hidden">
              Tableau des valeurs
              <Icon name="chevron-down" className="h-4 w-4 text-fg-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="max-h-96 overflow-auto border-t border-border">
              <table className="w-full border-collapse text-sm" style={{ minWidth: 640 }}>
                <thead className="sticky top-0 bg-bg-row">
                  <tr className="text-left font-cond text-xs font-bold uppercase tracking-widest text-fg-muted">
                    <th className="px-3 py-2.5 pl-4 font-bold">{unit === "hour" ? "Heure" : "Jour"}</th>
                    {dashboard.providers.map((usage) => (
                      <th key={usage.provider} className="px-3 py-2.5 text-right font-bold">
                        {apiProviderName(usage.provider)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.buckets
                    .map((bucket, i) => ({ bucket, i }))
                    .reverse()
                    .map(({ bucket, i }) => (
                      <tr key={bucket.key} className="border-t border-border">
                        <td className="px-3 py-1.5 pl-4 text-fg">{bucketLabel(bucket, unit)}</td>
                        {dashboard.providers.map((usage) => (
                          <td key={usage.provider} className={`px-3 py-1.5 text-right figures ${usage.series[i] === 0 ? "text-fg-muted" : "text-fg"}`}>
                            {formatCount(usage.series[i])}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>

        <Section title="Endpoints les plus appelés" description={`Sur ${periodLabel}. Un paramètre différent (une ligue, un club) fait un endpoint à part.`}>
          {dashboard.topEndpoints.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucune requête sur {periodLabel}.</p>
          ) : (
            <Table head={["API", "Endpoint", "Requêtes", "Dernier appel"]}>
              {dashboard.topEndpoints.map((row) => (
                <tr key={`${row.provider} ${row.endpoint}`} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/60">
                  <td className="whitespace-nowrap px-3 py-2 pl-4 text-fg">{apiProviderName(row.provider)}</td>
                  <td className="max-w-md break-all px-3 py-2 font-mono text-xs text-fg">{row.endpoint}</td>
                  <td className="px-3 py-2 figures text-fg">{formatCount(row.requests)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{formatAgo(row.lastCallAt, now)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Derniers appels" description="Les 25 plus récents de la période, toutes API confondues, avec ce que chaque réponse a dit du quota.">
          {dashboard.recentCalls.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun appel sur {periodLabel}.</p>
          ) : (
            <Table head={["Heure", "API", "Endpoint", "Quota renvoyé"]} minWidth={720}>
              {dashboard.recentCalls.map((call) => (
                <tr key={call.id.toString()} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/60">
                  <td className="whitespace-nowrap px-3 py-2 pl-4 figures text-fg-muted">{CALL_TIME.format(call.capturedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-fg">{apiProviderName(call.provider)}</td>
                  <td className="max-w-md break-all px-3 py-2 font-mono text-xs text-fg">{call.endpoint}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{quotaNote(call)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>
    </VestiaireShell>
  );
}
