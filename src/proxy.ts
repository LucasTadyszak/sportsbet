import { NextResponse, type NextRequest } from "next/server";
import { adminSecret, isValidSessionToken, SESSION_COOKIE } from "@/lib/adminSession";
import { KNOCK_COOKIE } from "@/lib/secretKnock";

// The hidden console (/vestiaire) doesn't exist for anyone who hasn't come by the easter egg or
// logged in: their requests are answered the way an unknown URL is, with the very same 404 page
// (a notFound() from the page itself would render a different, tell-tale error document). The
// pages and every Server Action still check the session themselves.
export function proxy(request: NextRequest) {
  const secret = adminSecret();
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (request.cookies.has(KNOCK_COOKIE) || (secret !== null && isValidSessionToken(secret, session))) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_introuvable", request.url));
}

export const config = { matcher: ["/vestiaire", "/vestiaire/:path*"] };
