import { NextRequest, NextResponse } from "next/server";
import { liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const query = req.nextUrl.searchParams.get("secret");
  return query === secret;
}

// Fixtures and live scores of the followed competitions (Free API Live Football Data): whatever is
// due, like a board page view does. Pinged every minute or two, it keeps live scores moving even
// when nobody is on the site.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await refreshLiveMatches({ force: req.nextUrl.searchParams.get("force") === "1" });
  if (!summary.configured) {
    return NextResponse.json({ ok: false, error: "RAPIDAPI_KEY is not set" }, { status: 500 });
  }
  const ok = !liveRefreshFailed(summary);
  return NextResponse.json({ ok, summary }, { status: ok ? 200 : 502 });
}

// Convenience for triggering a refresh from a browser or a plain HTTP cron pinger.
export const GET = POST;
