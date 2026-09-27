import { NextRequest, NextResponse } from "next/server";
import { refreshOdds } from "@/lib/refreshOdds";
import { refreshEdges } from "@/lib/refreshEdges";
import { LOGO_REQUESTS_PER_ODDS_REFRESH, refreshLogos } from "@/lib/refreshLogos";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const query = req.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshOdds();
    const edges = await refreshEdges();
    const logos = await refreshLogos({ maxRequests: LOGO_REQUESTS_PER_ODDS_REFRESH });
    // A competition that failed doesn't stop the others; the response still says it failed.
    const ok = !summary.some((row) => row.error);
    return NextResponse.json({ ok, summary, edges, logos }, { status: ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Convenience for triggering a refresh from a browser or a plain HTTP cron pinger.
export const GET = POST;
