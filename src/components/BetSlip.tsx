"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { betSlip, useBetSlip, type SlipState } from "@/lib/betSlip";
import { formatKickoff, hasKickedOff } from "@/lib/dates";
import {
  COMBO_BLOCKER_LABELS,
  formatBankrollShare,
  formatFrPct,
  formatMoney,
  formatOdds,
  marketLabel,
  outcomeLabel,
  stakeBlockerLabel,
} from "@/lib/labels";
import { comboStake, singleStake, type ComboStake, type SingleStake } from "@/lib/methodology/stake";
import { myBets, newBetId, useMyBets } from "@/lib/myBets";
import { newSavedBet } from "@/lib/savedBets";
import { COMBO_STAKE, advisedAmount, parseBankroll, selectionKey, type Selection, type SlipMode } from "@/lib/selection";
import { Icon } from "@/components/Icon";
import { Straight, slantTabClass } from "@/components/Slant";
import { TierBadge } from "@/components/Verdict";

const WHOLE_AMOUNT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const CENTS_AMOUNT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatAmount = (x: number) => (Number.isInteger(x) ? WHOLE_AMOUNT : CENTS_AMOUNT).format(x);
const BANKROLL_INPUT_ID = "slip-bankroll";

type SlipSummary = {
  mode: SlipMode;
  stakes: SingleStake[];
  combo: ComboStake | null;
  /** What the slip as a whole says to stake, in units (1 u = 1 % of bankroll). */
  units: number;
};

function summarize({ selections, mode }: SlipState): SlipSummary {
  const stakes = selections.map((s) => singleStake(s.verdict, s.price));
  if (mode === "combo" && selections.length >= 2) {
    const combo = comboStake(selections.map(({ eventId, verdict, price }) => ({ eventId, verdict, price })));
    return { mode, stakes, combo, units: combo.units };
  }
  return { mode: "simple", stakes, combo: null, units: stakes.reduce((sum, s) => sum + s.units, 0) };
}

const share = (bankroll: number, units: number) => formatMoney((bankroll * units) / 100);

const FIELD_LABEL = "font-cond text-[13px] font-bold uppercase tracking-wider text-fg-muted";
const AMOUNT_INPUT =
  "figures min-h-11 w-full border-2 border-border bg-bg-row pl-3 pr-8 text-lg font-semibold text-fg placeholder:font-medium placeholder:text-fg-muted transition-colors duration-200 focus:border-inverse focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-fall";

/** The bankroll input, saved in this browser as soon as it reads as an amount. */
export function BankrollField({ id, className = "" }: { id: string; className?: string }) {
  const { bankroll } = useBetSlip();
  // The raw text while the field is being edited; otherwise it shows the saved bankroll.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (bankroll === null ? "" : formatAmount(bankroll));
  const invalid = draft !== null && draft.trim() !== "" && parseBankroll(draft) === null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={FIELD_LABEL}>
        Ma bankroll
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="ex. 500"
          value={value}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onFocus={() => setDraft(value)}
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const amount = parseBankroll(text);
            if (amount !== null || text.trim() === "") betSlip.setBankroll(amount);
          }}
          className={AMOUNT_INPUT}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-cond text-base font-bold text-fg-muted">
          €
        </span>
      </div>
      <p id={`${id}-hint`} className={`text-xs ${invalid ? "text-fall" : "text-fg-muted"}`}>
        {invalid ? "Entre un montant positif, par exemple 500 ou 1 250,50." : "Enregistrée uniquement dans ce navigateur."}
      </p>
    </div>
  );
}

/** The invitation on the board and the picks: a bankroll first, then odds to click. */
export function BankrollPrompt({ className = "" }: { className?: string }) {
  return (
    <section
      aria-labelledby="bankroll-prompt-title"
      className={`flex flex-col gap-4 border-l-[5px] border-inverse bg-bg-elevated p-4 shadow-hard sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 -skew-x-12 items-center justify-center bg-bg-row text-fg">
          <Icon name="wallet" className="h-5 w-5 skew-x-12" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="bankroll-prompt-title" className="font-display text-xl uppercase leading-tight tracking-wide text-fg">
            Combien miser sur ta sélection ?
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
            Indique ta bankroll, puis clique sur les cotes qui t&apos;intéressent : pour chacune, tu vois quel pourcentage de ta
            bankroll tu peux miser, avec les mêmes règles de mise que les picks du modèle.
          </p>
        </div>
      </div>
      <BankrollField id="prompt-bankroll" className="sm:w-60 sm:shrink-0" />
    </section>
  );
}

const MODES: { value: SlipMode; label: string; help: string }[] = [
  { value: "simple", label: "Simples", help: "Un pari par cote, chacun avec sa propre mise." },
  { value: "combo", label: "Combiné", help: "Un seul pari sur toutes les cotes : il faut qu'elles passent toutes." },
];

function ModeSwitch({ mode }: { mode: SlipMode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Type de pari" className="flex gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => betSlip.setMode(m.value)}
            className={`${slantTabClass(mode === m.value)} flex-1 justify-center ${mode === m.value ? "" : "bg-bg-row"}`}
          >
            <Straight>{m.label}</Straight>
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{MODES.find((m) => m.value === mode)?.help}</p>
    </div>
  );
}

/** A single bet's advice: its share of the bankroll, or why it gets none. */
function StakeLine({ selection, stake, bankroll }: { selection: Selection; stake: SingleStake; bankroll: number | null }) {
  const blocked = stakeBlockerLabel(stake, selection.verdict);
  if (blocked || !selection.verdict) {
    return (
      <div className="flex items-start gap-3 bg-bg-row px-3 py-2.5">
        <span className="font-display text-2xl leading-none tracking-wide text-fg-muted">{formatBankrollShare(0)}</span>
        <span className="flex flex-col gap-0.5 text-xs leading-relaxed">
          <span className="font-semibold text-fg">{blocked?.title}</span>
          <span className="text-fg-muted">{blocked?.detail}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 border-l-4 border-accent bg-accent-dim px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <TierBadge tier={selection.verdict.tier} compact />
        <span className="flex items-baseline gap-1.5 font-display text-2xl leading-none tracking-wide">
          <span className="text-fg">{formatBankrollShare(stake.units)}</span>
          {bankroll !== null ? <span className="text-accent">· {share(bankroll, stake.units)}</span> : null}
        </span>
      </div>
      <p className="text-xs text-fg-muted">
        de ta bankroll — proba modèle {formatFrPct(selection.verdict.modelProb)}, EV {formatFrPct(stake.ev ?? 0, true)} à cette cote
      </p>
    </div>
  );
}

/** A bet's stake in euros — the one typed, else the advised one — and what it would pay back. */
function StakeField({
  label,
  typed,
  advised,
  price,
  onChange,
}: {
  label: string;
  typed: number | null;
  advised: number | null;
  /** The bet's odds. */
  price: number;
  /** An amount typed, or null once the field is emptied (back to the advised stake). */
  onChange: (amount: number | null) => void;
}) {
  const id = useId();
  // The raw text while the field is being edited; otherwise it shows the stake.
  const [draft, setDraft] = useState<string | null>(null);
  const stake = typed ?? advised;
  const value = draft ?? (stake === null ? "" : formatAmount(stake));
  const invalid = draft !== null && draft.trim() !== "" && parseBankroll(draft) === null;

  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
        <div className="relative w-32">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="ex. 10"
            value={value}
            aria-invalid={invalid}
            onFocus={() => setDraft(value)}
            onBlur={() => setDraft(null)}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const amount = parseBankroll(text);
              if (amount !== null || text.trim() === "") onChange(amount);
            }}
            className={AMOUNT_INPUT}
          />
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-cond text-base font-bold text-fg-muted">
            €
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 pb-1">
        <span className={FIELD_LABEL}>Gain potentiel</span>
        <span className="font-display text-2xl leading-none tracking-wide text-fg">{stake === null ? "—" : formatMoney(stake * price)}</span>
      </div>
    </div>
  );
}

/** In a combo, each leg only says whether it would be worth a bet on its own. */
function LegLine({ selection, stake }: { selection: Selection; stake: SingleStake }) {
  const blocked = stakeBlockerLabel(stake, selection.verdict);
  if (blocked) {
    return (
      <p className="flex items-start gap-2 text-xs leading-relaxed">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center bg-fall text-on-rise">
          <Icon name="x" className="h-3 w-3" />
        </span>
        <span>
          <span className="font-semibold text-fg">{blocked.title}</span>
          <span className="text-fg-muted"> — {blocked.detail}</span>
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-xs text-fg-muted">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center bg-rise text-on-rise">
        <Icon name="check" className="h-3 w-3" />
      </span>
      Vaut une mise à elle seule ({formatBankrollShare(stake.units)})
    </p>
  );
}

/** One selection in the slip: its offer, then (in simples) the stake the model advises and the one typed. */
export function SelectionItem({
  selection: s,
  stake,
  mode,
  bankroll,
  typedStake,
}: {
  selection: Selection;
  stake: SingleStake;
  mode: SlipMode;
  bankroll: number | null;
  /** The stake typed for it as a single bet. */
  typedStake: number | null;
}) {
  const outcome = outcomeLabel(s.marketKey, s.outcomeName, s.point, s.homeTeam, s.awayTeam);
  return (
    <li className="flex flex-col gap-3 border-l-4 border-slate bg-bg p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/match/${s.eventId}`}
            onClick={betSlip.close}
            className="truncate text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {s.homeTeam} – {s.awayTeam} · {formatKickoff(new Date(s.commenceTime))}
          </Link>
          <span className="truncate font-cond text-xl font-extrabold uppercase leading-tight tracking-wide text-fg">{outcome}</span>
          <span className="text-xs text-fg-muted">
            {marketLabel(s.marketKey, s.point)} · {s.bookmakerTitle}
          </span>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <span className="font-display text-3xl leading-none tracking-wide text-fg">{formatOdds(s.price)}</span>
          <button
            type="button"
            onClick={() => betSlip.remove(selectionKey(s))}
            aria-label={`Retirer ${outcome} de ma sélection`}
            className="-mr-1.5 flex h-8 w-8 items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-bg-row hover:text-fall"
          >
            <Icon name="x" />
          </button>
        </div>
      </div>
      {mode === "simple" ? (
        <>
          <StakeLine selection={s} stake={stake} bankroll={bankroll} />
          <StakeField
            label="Ma mise"
            typed={typedStake}
            advised={advisedAmount(bankroll, stake.units)}
            price={s.price}
            onChange={(amount) => betSlip.setStake(selectionKey(s), amount)}
          />
        </>
      ) : (
        <LegLine selection={s} stake={stake} />
      )}
    </li>
  );
}

type BetDraft = { selections: Selection[]; stake: number | null; advisedUnits: number };

/** The bets saving the slip makes — the combo, or a single bet per selection — each with its stake, typed or advised. */
function betDrafts({ selections, stakes, bankroll }: SlipState, summary: SlipSummary): BetDraft[] {
  const { combo } = summary;
  if (combo) return [{ selections, stake: stakes[COMBO_STAKE] ?? advisedAmount(bankroll, combo.units), advisedUnits: combo.units }];
  return selections.map((s, i) => {
    const { units } = summary.stakes[i];
    return { selections: [s], stake: stakes[selectionKey(s)] ?? advisedAmount(bankroll, units), advisedUnits: units };
  });
}

type SaveNotice = { kind: "saved"; count: number } | { kind: "started" };

/** Saves the slip in "Mes paris" as if it had been played, then empties it. */
function SaveButton({ slip, summary, onDone }: { slip: SlipState; summary: SlipSummary; onDone: (notice: SaveNotice) => void }) {
  const drafts = betDrafts(slip, summary);
  const sameEvent = summary.combo?.blocker === "SAME_EVENT";
  const missing = drafts.some((draft) => draft.stake === null);
  const total = drafts.reduce((sum, draft) => sum + (draft.stake ?? 0), 0);
  const label = summary.combo ? "Enregistrer le combiné" : drafts.length > 1 ? `Enregistrer ces ${drafts.length} paris` : "Enregistrer ce pari";
  const hint = sameEvent
    ? "Deux sélections du même match ne se combinent pas : passe en simples, ou gardes-en une par match."
    : missing
      ? summary.combo
        ? "Indique ta mise sur le combiné pour l'enregistrer."
        : "Indique ta mise sur chaque pari pour l'enregistrer."
      : "Rien n'est parié pour de vrai : Mes paris te dira ce que tu aurais gagné.";

  const save = () => {
    if (sameEvent || missing) return;
    const now = new Date();
    // Its price was only on offer until kickoff: a match that has started is dropped, not saved.
    if (slip.selections.some((s) => hasKickedOff(new Date(s.commenceTime), now))) {
      betSlip.dropStarted();
      onDone({ kind: "started" });
      return;
    }
    myBets.add(drafts.map((draft) => newSavedBet(draft.selections, draft.stake ?? 0, draft.advisedUnits, now, newBetId(now))));
    betSlip.clear();
    onDone({ kind: "saved", count: drafts.length });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={save}
        disabled={sameEvent || missing}
        className="flex min-h-12 w-full -skew-x-6 items-center justify-center bg-inverse px-4 text-on-inverse transition-colors duration-200 enabled:hover:bg-fg disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span className="inline-flex skew-x-6 items-center gap-2 font-display text-xl uppercase leading-none tracking-wide">
          <Icon name="ticket" className="h-5 w-5" />
          {label}
          {!sameEvent && !missing ? <span>· {formatMoney(total)}</span> : null}
        </span>
      </button>
      <p className="text-xs leading-relaxed text-fg-muted">{hint}</p>
    </div>
  );
}

/** What saving just did: the bets are in "Mes paris", or a match had started. */
function SaveNoticeBanner({ notice }: { notice: SaveNotice }) {
  if (notice.kind === "started") {
    return (
      <p role="alert" className="flex items-start gap-2.5 border-l-4 border-fall bg-bg-row px-4 py-3 text-sm leading-relaxed text-fg">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 text-fall" />
        Un match de ta sélection a commencé : sa cote n&apos;est plus proposée, elle a été retirée. Vérifie ta sélection avant de
        l&apos;enregistrer.
      </p>
    );
  }
  const many = notice.count > 1;
  return (
    <div role="status" className="flex items-start gap-3 border-l-4 border-rise bg-bg-row px-4 py-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-rise text-on-rise">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-fg">{many ? `${notice.count} paris enregistrés` : "Pari enregistré"}</span>
        <span className="leading-relaxed text-fg-muted">
          Une fois les matchs joués, Mes paris te dira {many ? "s'ils auraient été gagnants" : "s'il aurait été gagnant"}.
        </span>
        <Link href="/mes-paris" onClick={betSlip.close} className="inline-flex w-fit items-center gap-1 font-medium text-link hover:underline">
          Voir mes paris <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function SlipTotal({ summary, bankroll, count }: { summary: SlipSummary; bankroll: number | null; count: number }) {
  const { combo, units } = summary;
  const caption = combo
    ? units > 0
      ? "de ta bankroll sur le combiné"
      : combo.blocker
        ? COMBO_BLOCKER_LABELS[combo.blocker]
        : ""
    : units > 0
      ? `de ta bankroll${count > 1 ? `, sur ${count} paris` : ""}`
      : count > 1
        ? "Le modèle ne voit de valeur sur aucune de ces cotes."
        : "Le modèle ne voit pas de valeur sur cette cote.";

  return (
    <div className="flex flex-col gap-3">
      {combo ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-fg-muted">
            Combiné de {count} cotes
            {combo.probability !== null ? ` · proba modèle ${formatFrPct(combo.probability)}` : ""}
          </span>
          <span className="figures text-base font-bold text-fg">cote {formatOdds(combo.price)}</span>
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={FIELD_LABEL}>{combo ? "À miser" : count > 1 ? "Total à miser" : "À miser"}</span>
          <span className="text-sm leading-snug text-fg-muted">{caption}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display text-4xl leading-none tracking-wide text-fg">{formatBankrollShare(units)}</span>
          {bankroll !== null ? (
            <span className="font-display text-2xl leading-none tracking-wide text-accent">{share(bankroll, units)}</span>
          ) : (
            <button
              type="button"
              onClick={() => document.getElementById(BANKROLL_INPUT_ID)?.focus()}
              className="text-xs font-medium text-link underline underline-offset-2"
            >
              Ajoute ta bankroll pour le montant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SlipContent({ slip, summary }: { slip: SlipState; summary: SlipSummary }) {
  const { bankroll, selections, stakes } = slip;
  const count = selections.length;
  const savedBets = useMyBets();
  const [notice, setNotice] = useState<SaveNotice | null>(null);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 bg-accent px-5 py-3 text-on-accent">
        <div className="flex items-center gap-2.5">
          <Icon name="ticket" className="h-5 w-5" />
          <h2 id="slip-title" className="font-display text-2xl uppercase leading-none tracking-wide">
            Ma sélection
          </h2>
          {count > 0 ? (
            <span className="bg-on-accent px-2 py-1 font-cond text-xs font-extrabold uppercase leading-none tracking-wider text-accent">
              {count} cote{count > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={betSlip.close}
          aria-label="Fermer ma sélection"
          className="-mr-2 flex h-10 w-10 items-center justify-center transition-colors duration-200 hover:bg-on-accent/10 focus-visible:outline-on-accent"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {notice ? <SaveNoticeBanner notice={notice} /> : null}
        <BankrollField id={BANKROLL_INPUT_ID} />
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 border-2 border-dashed border-border px-5 py-8 text-center">
            <span className="flex h-11 w-11 -skew-x-12 items-center justify-center bg-bg-row text-fg-muted">
              <Icon name="ticket" className="h-5 w-5 skew-x-12" />
            </span>
            <p className="mt-1 font-display text-xl uppercase tracking-wide text-fg">Ta sélection est vide</p>
            <p className="text-sm leading-relaxed text-fg-muted">
              Clique sur une cote (tableau, fiche d&apos;un match ou picks) pour l&apos;ajouter : tu verras quel pourcentage de ta
              bankroll tu peux y miser.
            </p>
            <Link href="/picks" onClick={betSlip.close} className="mt-1 text-sm font-medium text-link hover:underline">
              Voir les picks du modèle
            </Link>
            {savedBets && savedBets.length > 0 ? (
              <Link href="/mes-paris" onClick={betSlip.close} className="text-sm font-medium text-link hover:underline">
                Mes paris enregistrés ({savedBets.length})
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {count >= 2 ? <ModeSwitch mode={summary.mode} /> : null}
            <ul className="flex flex-col gap-3">
              {selections.map((s, i) => (
                <SelectionItem
                  key={selectionKey(s)}
                  selection={s}
                  stake={summary.stakes[i]}
                  mode={summary.mode}
                  bankroll={bankroll}
                  typedStake={stakes[selectionKey(s)] ?? null}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {count > 0 ? (
        <footer className="flex shrink-0 flex-col gap-3.5 border-t-2 border-border bg-bg-deep px-5 py-4">
          <SlipTotal summary={summary} bankroll={bankroll} count={count} />
          {summary.combo ? (
            <StakeField
              label="Ma mise sur le combiné"
              typed={stakes[COMBO_STAKE] ?? null}
              advised={advisedAmount(bankroll, summary.combo.units)}
              price={summary.combo.price}
              onChange={(amount) => betSlip.setStake(COMBO_STAKE, amount)}
            />
          ) : null}
          <SaveButton slip={slip} summary={summary} onDone={setNotice} />
          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={betSlip.clear}
              className="inline-flex min-h-9 items-center gap-1.5 font-medium text-fg-muted transition-colors duration-200 hover:text-fall"
            >
              <Icon name="trash" className="h-3.5 w-3.5" /> Vider la sélection
            </button>
            <Link href="/methodologie#mise" onClick={betSlip.close} className="font-medium text-link hover:underline">
              Comment c&apos;est calculé
            </Link>
          </div>
          <p className="text-[11px] leading-relaxed text-fg-muted">
            ¼ Kelly sur la probabilité du modèle à la cote choisie, plafonné selon le verdict. Indicatif, pas un conseil de pari :
            jouer comporte des risques (09 74 75 13 13).
          </p>
        </footer>
      ) : null}
    </>
  );
}

/** The floating slab that opens the slip: in orange, since it holds the user's selection. */
export function SlipLauncher({
  count,
  headline,
  onClick,
  className = "",
}: {
  count: number;
  /** What the slip says to stake, e.g. "2,5 % · 12,50 €". */
  headline: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ma sélection : ${count} cote${count > 1 ? "s" : ""}, ${headline}`}
      className={`flex min-h-12 -skew-x-6 items-center justify-between gap-5 bg-accent py-2 pl-4 pr-5 text-on-accent shadow-hard transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-on-accent ${className}`}
    >
      <span className="flex skew-x-6 items-center gap-2.5">
        <Icon name="ticket" className="h-5 w-5" />
        <span className="font-display text-xl uppercase leading-none tracking-wide">Ma sélection</span>
        <span className="flex h-6 min-w-6 items-center justify-center bg-on-accent px-1.5 font-display text-base leading-none text-accent">{count}</span>
      </span>
      <span className="skew-x-6 font-cond text-base font-bold uppercase tracking-wide">{headline}</span>
    </button>
  );
}

/** The bankroll in the header, from `sm`: it opens the slip, where it is typed. */
export function HeaderBankroll() {
  const { bankroll } = useBetSlip();
  return (
    <button
      type="button"
      onClick={betSlip.open}
      aria-label={bankroll === null ? "Ma bankroll : à indiquer dans ma sélection" : `Ma bankroll : ${formatAmount(bankroll)} € — ouvrir ma sélection`}
      className="hidden shrink-0 items-baseline gap-2 font-cond text-sm font-bold uppercase tracking-wider text-fg-muted transition-colors duration-200 hover:text-fg sm:inline-flex"
    >
      Bankroll
      <span className="font-display text-2xl leading-none tracking-wide text-fg">{bankroll === null ? "—" : `${formatAmount(bankroll)} €`}</span>
    </button>
  );
}

/** The floating "Ma sélection" button and the slip it opens, on every page. */
export function BetSlip() {
  const slip = useBetSlip();
  const { open, bankroll, selections } = slip;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Nothing can be turned into euros without a bankroll: start there.
      if (bankroll === null) document.getElementById(BANKROLL_INPUT_ID)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, bankroll]);

  const count = selections.length;
  const summary = summarize(slip);
  const { units } = summary;
  const headline = bankroll === null ? "Ajoute ta bankroll" : units > 0 ? `${formatBankrollShare(units)} · ${share(bankroll, units)}` : formatBankrollShare(0);

  return (
    <>
      {count > 0 ? (
        <>
          {/* Keeps the end of every page clear of the floating button. */}
          <div aria-hidden className="h-24 shrink-0 bg-bg-deep" />
          {!open ? (
            <SlipLauncher
              count={count}
              headline={headline}
              onClick={betSlip.open}
              className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:bottom-6 sm:right-6"
            />
          ) : null}
        </>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby="slip-title"
        onClose={betSlip.close}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) betSlip.close();
        }}
        className="m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col overflow-hidden border-0 bg-bg-elevated p-0 text-fg shadow-2xl transition-[translate,opacity] duration-300 ease-out open:flex starting:translate-y-6 starting:opacity-0 backdrop:bg-[rgb(16_16_20/0.65)] sm:ml-auto sm:mt-0 sm:h-dvh sm:max-h-dvh sm:w-[26rem] sm:border-l-[3px] sm:border-slate sm:starting:translate-x-6 sm:starting:translate-y-0"
      >
        {open ? <SlipContent slip={slip} summary={summary} /> : null}
      </dialog>
    </>
  );
}
