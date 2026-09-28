// The three looks of the site side by side (src/lib/themes.ts), each drawn with the real
// components on sample matches (src/lib/themePreview.ts). Every panel carries its own
// data-theme, so the tokens of src/app/globals.css re-theme everything inside it; the panels
// are inert: a click there neither navigates nor fills the slip.
import type { ReactNode } from "react";
import { formatBankrollShare, formatMoney } from "@/lib/labels";
import { THEMES, type ThemeInfo } from "@/lib/themes";
import { themePreview, type ThemePreview } from "@/lib/themePreview";
import { SelectionItem, SlipLauncher } from "@/components/BetSlip";
import { MatchCard } from "@/components/MatchCard";
import { OddsButton } from "@/components/OddsButton";
import { PageFooter, PageIntro, SiteHeader } from "@/components/SiteHeader";
import { SlipPreview } from "@/components/SlipPreview";
import { StatTile, TierBadge } from "@/components/Verdict";
import { ApplyTheme } from "./ApplyTheme";

// The sample kick-offs are set from the time of the request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Thèmes — SportsBet" };

const PALETTE = [
  { name: "Graphite", hex: "#2c2b32", role: "L'encre des thèmes clairs, le fond du thème sombre, l'en-tête d'Ardoise." },
  { name: "Ardoise", hex: "#4a576a", role: "Les textes secondaires, le logo, les filtres actifs d'Ardoise." },
  { name: "Acier", hex: "#a8b6ca", role: "Filets et fonds teintés ; textes secondaires et éléments actifs sur fond sombre." },
  { name: "Orange", hex: "#ff7a1a", role: "Seulement ce qui compte : la cote que prendrait le modèle, ta sélection, les mises." },
];

function Palette() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PALETTE.map((color) => (
        <li key={color.hex} className="flex items-start gap-3 rounded-xl border border-border bg-bg-elevated p-3 shadow-card">
          <span aria-hidden className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-fg/15" style={{ background: color.hex }} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className="font-display text-base font-semibold text-fg">{color.name}</span>
              <code className="font-mono-tabular text-xs text-fg-muted">{color.hex}</code>
            </span>
            <span className="text-xs leading-relaxed text-fg-muted">{color.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PreviewLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{children}</h3>;
}

function ThemePanel({ theme, preview }: { theme: ThemeInfo; preview: ThemePreview }) {
  const { selection, stake, bankroll } = preview.slip;
  const headline = `${formatBankrollShare(stake.units)} · ${formatMoney((bankroll * stake.units) / 100)}`;
  return (
    <section
      data-theme={theme.id}
      aria-labelledby={`theme-${theme.id}`}
      className="mx-auto flex w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-bg text-fg shadow-card xl:max-w-none"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`theme-${theme.id}`} className="flex items-baseline gap-2 font-display text-xl font-extrabold text-fg">
            {theme.name}
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{theme.mood}</span>
          </h2>
          <p className="text-sm leading-relaxed text-fg-muted">{theme.description}</p>
        </div>
        <ApplyTheme theme={theme.id} name={theme.name} />
      </div>

      <div inert className="flex flex-1 flex-col">
        <SiteHeader preview active="board" />
        <SlipPreview selected={preview.selected}>
          <div className="flex flex-col gap-4 p-4">
            <PreviewLabel>Tableau</PreviewLabel>
            <MatchCard event={preview.upcoming} />
            <MatchCard event={preview.live} />

            <PreviewLabel>Une cote, selon ce qu&apos;elle est</PreviewLabel>
            <div className="grid grid-cols-4 gap-2 pt-1.5">
              {preview.states.map((state) => (
                <OddsButton
                  key={state.label}
                  variant="tile"
                  label={state.label}
                  selection={state.selection}
                  isPick={state.isPick}
                  oddsError={state.oddsError}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <TierBadge tier="STRONG_BET" />
              <TierBadge tier="GOOD_BET" />
              <TierBadge tier="PASS" compact />
            </div>

            <PreviewLabel>Ma sélection</PreviewLabel>
            <ul className="flex flex-col">
              <SelectionItem selection={selection} stake={stake} mode="simple" bankroll={bankroll} typedStake={null} />
            </ul>
            <SlipLauncher count={1} headline={headline} className="self-end" />

            <PreviewLabel>Historique</PreviewLabel>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="CLV moyenne" value="+2.4%" hint="38 picks avec clôture" tone="rise" />
              <StatTile label="ROI" value="−3.1%" tone="fall" />
            </div>
          </div>
        </SlipPreview>
      </div>
    </section>
  );
}

export default function ThemesPage() {
  const preview = themePreview();
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[88rem] flex-col gap-8 px-4 py-10 sm:px-6">
        <PageIntro title="Thèmes du site">
          Trois variantes du même site, sur la même palette : graphite, ardoise et acier pour tout ce qui structure la page, et
          un orange réservé à ce qui compte — la cote que le modèle prendrait, ta sélection, la mise conseillée. Celle que tu
          appliques vaut pour tout le site et reste enregistrée dans ce navigateur ; le bouton Thème de l&apos;en-tête permet
          d&apos;en changer à tout moment.
        </PageIntro>
        <Palette />
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          {THEMES.map((theme) => (
            <ThemePanel key={theme.id} theme={theme} preview={preview} />
          ))}
        </div>
      </main>
      <PageFooter />
    </div>
  );
}
