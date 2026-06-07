import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, expectedSessionToken } from "@/lib/auth";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same feature).
// This is the single-user password gate described in the brief (§4).
//
// Routes reachable without the dashboard password:
//   crons authenticate with CRON_SECRET; webhooks with their own signature.
const PUBLIC_PREFIXES = ["/login", "/api/cron", "/api/webhooks"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  // If no password is configured, the gate is disabled (dev convenience).
  if (!password) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await expectedSessionToken(password);
  if (token && token === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
