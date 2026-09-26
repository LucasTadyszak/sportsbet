import { NextRequest, NextResponse } from "next/server";
import { refreshOdds } from "@/lib/refreshOdds";
import { refreshEdges } from "@/lib/refreshEdges";

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
    return NextResponse.json({ ok: true, summary, edges });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Convenience for triggering a refresh from a browser or a plain HTTP cron pinger.
export const GET = POST;
