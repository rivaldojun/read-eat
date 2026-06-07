import crypto from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { recordSignup } from "@/lib/attribution/record";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  utm_campaign: z.string().min(1),
  event: z.string().optional(),
});

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify the X-FutuRole-Signature header. Accepts either the shared secret
 * directly, or an HMAC-SHA256(rawBody, secret) hex digest (recommended).
 * If FUTUROLE_WEBHOOK_SECRET is unset, verification is skipped (dev only).
 */
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = env.FUTUROLE_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  if (timingSafeEqual(signature, secret)) return true;
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(signature, hmac);
}

/**
 * Receives FutuRole signup events and credits the attributed posted reply.
 *   POST /api/webhooks/futurole
 *   Header: X-FutuRole-Signature: <shared secret | HMAC-SHA256 hex>
 *   Body:   { "event": "signup", "utm_campaign": "<opportunityId>" }
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-futurole-signature") ?? "";

  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Missing utm_campaign" },
      { status: 400 },
    );
  }

  try {
    const { matched } = await recordSignup(parsed.data.utm_campaign);
    log.info("webhook:futurole", "signup", {
      campaign: parsed.data.utm_campaign,
      matched,
    });
    // 200 even when unmatched: the event was accepted, just not attributable.
    return NextResponse.json({ ok: true, matched });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
