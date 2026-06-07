import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { formatMoneyCents } from "@/lib/format";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Low-level send. No-op (returns false) when Telegram isn't configured. */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log.warn("telegram", "not configured (TELEGRAM_BOT_TOKEN/CHAT_ID) — skipping");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      log.error("telegram", "send failed", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("telegram", "send error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Instant alert for a high-intent lead (brief §6: score >= HOT_LEAD_THRESHOLD). */
export async function notifyHotLead(opp: {
  title: string | null;
  intentScore: number | null;
  permalink: string;
  persona: string | null;
}): Promise<void> {
  const lines = [
    `🔥 <b>Hot lead</b> — score ${opp.intentScore ?? "?"}`,
    escapeHtml(opp.title ?? "(untitled)"),
    opp.persona ? `persona: ${escapeHtml(opp.persona)}` : null,
    opp.permalink,
  ].filter(Boolean) as string[];
  await sendTelegram(lines.join("\n"));
}

export interface DailySummary {
  foundToday: number;
  postedToday: number;
  clicks: number;
  signups: number;
  paidUsers: number;
  mrrCents: number;
}

export async function sendDailySummary(s: DailySummary): Promise<boolean> {
  const text = [
    "📊 <b>FutuRole Growth — daily summary</b>",
    `• Opportunities found today: ${s.foundToday}`,
    `• Replies posted today: ${s.postedToday}`,
    `• Total clicks: ${s.clicks}`,
    `• Total signups: ${s.signups}`,
    `• Paying users: ${s.paidUsers}`,
    `• MRR attributed: ${formatMoneyCents(s.mrrCents)}`,
  ].join("\n");
  return sendTelegram(text);
}
