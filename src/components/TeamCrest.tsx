import Image from "next/image";
import { Icon } from "@/components/Icon";

/**
 * A club's crest (src/lib/crests.ts). Always rendered next to the club's name, so it's
 * decorative (empty alt); a club without one gets a faint shield to keep names aligned.
 */
export function TeamCrest({ src, size = 18 }: { src: string | null; size?: number }) {
  if (!src) {
    return (
      <span aria-hidden className="flex shrink-0 items-center justify-center text-fg-muted/40" style={{ width: size, height: size }}>
        <Icon name="shield" className="h-[85%] w-[85%]" />
      </span>
    );
  }
  return <Image src={src} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
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
