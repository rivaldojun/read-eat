import { NextResponse } from "next/server";

import { assertCronAuth } from "@/lib/cron-auth";
import { runRadar } from "@/lib/radar";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Radar cron entrypoint. Collects opportunities from enabled sources.
 * Triggered by Vercel Cron (GET) — see vercel.json. POST is accepted too for
 * manual triggering. NEVER posts anything externally (human-in-the-loop).
 */
async function handler(req: Request) {
  const auth = assertCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await runRadar();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    log.error("radar", "run failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;
