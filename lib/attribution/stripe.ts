import Stripe from "stripe";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

/**
 * Stripe reconciliation. Ties subscriptions back to a posted reply via
 * `utm_campaign` (= opportunity id), which FutuRole must set at checkout.
 *
 * How to pass utm_campaign at checkout (documented contract):
 *   stripe.checkout.sessions.create({
 *     ...,
 *     subscription_data: { metadata: { utm_campaign: "<opportunityId>" } },
 *   })
 * (Fallback also supported: the Customer's metadata.utm_campaign.)
 *
 * The pure helpers below (monthlyCents, aggregateByCampaign) carry the
 * reconciliation logic and are unit-tested.
 */

export interface NormalizedSub {
  campaign: string | null;
  status: string;
  monthlyAmountCents: number;
}

export interface CampaignTotals {
  trials: number;
  paidUsers: number;
  mrrCents: number;
}

/** Normalise any recurring price to a monthly cents amount. */
export function monthlyCents(
  amountCents: number,
  interval: "day" | "week" | "month" | "year" | string,
  intervalCount = 1,
): number {
  const count = intervalCount > 0 ? intervalCount : 1;
  const perInterval = amountCents / count;
  switch (interval) {
    case "month":
      return Math.round(perInterval);
    case "year":
      return Math.round(perInterval / 12);
    case "week":
      return Math.round((perInterval * 52) / 12);
    case "day":
      return Math.round((perInterval * 365) / 12);
    default:
      return Math.round(perInterval);
  }
}

const PAID_STATUSES = new Set(["active", "past_due"]);

/**
 * Aggregate normalised subscriptions per campaign:
 *   - trialing            -> trials++
 *   - active / past_due   -> paidUsers++ and MRR added
 *   - everything else     -> ignored (canceled, incomplete, unpaid…)
 */
export function aggregateByCampaign(
  subs: NormalizedSub[],
): Map<string, CampaignTotals> {
  const map = new Map<string, CampaignTotals>();
  for (const sub of subs) {
    if (!sub.campaign) continue;
    const totals =
      map.get(sub.campaign) ?? { trials: 0, paidUsers: 0, mrrCents: 0 };
    if (sub.status === "trialing") {
      totals.trials++;
    } else if (PAID_STATUSES.has(sub.status)) {
      totals.paidUsers++;
      totals.mrrCents += sub.monthlyAmountCents;
    }
    map.set(sub.campaign, totals);
  }
  return map;
}

function extractCampaign(sub: Stripe.Subscription): string | null {
  const fromSub = sub.metadata?.utm_campaign;
  if (fromSub) return fromSub;
  const customer = sub.customer;
  if (customer && typeof customer !== "string" && !("deleted" in customer)) {
    return (customer as Stripe.Customer).metadata?.utm_campaign ?? null;
  }
  return null;
}

function normalizeSubscription(sub: Stripe.Subscription): NormalizedSub {
  let monthly = 0;
  for (const item of sub.items.data) {
    const price = item.price;
    const unit = price.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    if (price.recurring) {
      monthly += monthlyCents(
        unit * qty,
        price.recurring.interval,
        price.recurring.interval_count ?? 1,
      );
    }
  }
  return {
    campaign: extractCampaign(sub),
    status: sub.status,
    monthlyAmountCents: monthly,
  };
}

export interface ReconcileSummary {
  processed: number;
  campaigns: number;
  updated: number;
  skipped: boolean;
}

/** Fetch all subscriptions, reconcile, and write trials/paid/MRR per reply. */
export async function reconcileStripe(): Promise<ReconcileSummary> {
  if (!env.STRIPE_SECRET_KEY) {
    log.warn("attribution", "STRIPE_SECRET_KEY not set — skipping reconcile");
    return { processed: 0, campaigns: 0, updated: 0, skipped: true };
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const subs: NormalizedSub[] = [];

  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.customer"],
  })) {
    subs.push(normalizeSubscription(sub));
  }

  const agg = aggregateByCampaign(subs);
  let updated = 0;

  for (const [campaign, totals] of agg) {
    const posted = await prisma.postedReply.findFirst({
      where: { utmCampaign: campaign },
    });
    if (!posted) continue;

    // Snapshot reconcile: overwrite subscription-derived fields, never signups
    // (signups are owned by the webhook).
    await prisma.attribution.upsert({
      where: { postedReplyId: posted.id },
      update: {
        trials: totals.trials,
        paidUsers: totals.paidUsers,
        mrrCents: totals.mrrCents,
      },
      create: {
        postedReplyId: posted.id,
        trials: totals.trials,
        paidUsers: totals.paidUsers,
        mrrCents: totals.mrrCents,
      },
    });
    updated++;
  }

  log.info("attribution", "reconcile done", {
    processed: subs.length,
    campaigns: agg.size,
    updated,
  });
  return { processed: subs.length, campaigns: agg.size, updated, skipped: false };
}
