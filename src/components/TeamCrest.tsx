import { Shield } from "@/components/LogoFallbacks";
import { RemoteLogo } from "@/components/RemoteLogo";

/**
 * A logo shown next to the name it stands for, so decorative (empty alt); `fallback` if it doesn't
 * load. Logos are drawn for a light background: on the site's dark panels they sit on a round
 * light plate, padded by an eighth of their size.
 */
function Logo({ src, size, fallback = null }: { src: string; size: number; fallback?: "shield" | null }) {
  return (
    <RemoteLogo
      src={src}
      size={size}
      className="shrink-0 rounded-full bg-logo-plate object-contain"
      style={{ width: size, height: size, padding: Math.round(size * 0.12) }}
      fallback={fallback}
    />
  );
}

/**
 * A club's crest (src/lib/crests.ts). Always rendered next to the club's name, so it's
 * decorative (empty alt); a club without one, or whose logo doesn't load, gets a faint
 * shield to keep names aligned.
 */
export function TeamCrest({ src, size = 18 }: { src: string | null; size?: number }) {
  if (!src) return <Shield size={size} />;
  return <Logo src={src} size={size} fallback="shield" />;
}

/** A club name with its crest in front, truncated to fit lists and table cells. */
export function TeamName({ name, crest, size, className = "" }: { name: string; crest: string | null; size?: number; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <TeamCrest src={crest} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * A competition's name with its logo in front (src/lib/refreshLogos.ts). A competition
 * without one just shows its name: nothing to keep aligned with, unlike a list of clubs.
 */
export function CompetitionName({ title, logo, size = 16, className = "" }: { title: string; logo: string | null; size?: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center ${size >= 20 ? "gap-2" : "gap-1.5"} ${className}`}>
      {logo ? <Logo src={logo} size={size} /> : null}
      <span className="truncate">{title}</span>
    </span>
  );
}
