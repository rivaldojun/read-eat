import { env } from "@/lib/env";

/**
 * Guards /api/cron/* routes. If CRON_SECRET is set, requires
 * `Authorization: Bearer <CRON_SECRET>` (this is exactly what Vercel Cron
 * sends when CRON_SECRET is configured). If unset, the route is open — fine
 * for local dev, but set CRON_SECRET in production.
 */
export function assertCronAuth(
  req: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = env.CRON_SECRET;
  if (!secret) return { ok: true };

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return { ok: true };

  return { ok: false, status: 401, error: "Unauthorized" };
}
