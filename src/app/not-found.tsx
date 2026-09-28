import Link from "next/link";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/Verdict";

// Every 404 of the site, an unknown URL as much as a page calling notFound() — the hidden console
// (/vestiaire) included, which must look like any other page that doesn't exist.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <title>Page introuvable — SportsBet</title>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <EmptyState title="Page introuvable" icon="search">
          Cette page n&apos;existe pas, ou plus.{" "}
          <Link href="/" className="font-medium text-accent-strong underline underline-offset-2">
            Retour au tableau
          </Link>
        </EmptyState>
      </main>
      <PageFooter />
    </div>
  );
}
