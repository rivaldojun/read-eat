import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Anti-ban guardrail (brief §6 / §8): keep a healthy ratio of helpful replies
 * (no link) to link-bearing replies — target >= HELPFUL_TO_LINK_RATIO : 1.
 * Tracked per account per UTC day via AccountActivity.
 */
export interface GuardrailStatus {
  date: string;
  postsWithLink: number;
  postsHelpful: number;
  totalPosts: number;
  ratioTarget: number;
  dailyLimit: number;
  /** True if posting another link would still respect the ratio. */
  withinLimit: boolean;
  /** True if today's total post count is at/over the human-pace limit. */
  paceWarning: boolean;
  /** Helpful (no-link) replies still recommended before the next link reply. */
  recommendedHelpfulBeforeNextLink: number;
}

export function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getGuardrailStatus(
  accountName = "me",
): Promise<GuardrailStatus> {
  const date = todayUtc();
  const row = await prisma.accountActivity.findUnique({
    where: { accountName_date: { accountName, date } },
  });

  const postsWithLink = row?.postsWithLink ?? 0;
  const postsHelpful = row?.postsHelpful ?? 0;
  const totalPosts = postsWithLink + postsHelpful;
  const ratioTarget = env.HELPFUL_TO_LINK_RATIO;
  const dailyLimit = env.DAILY_POST_LIMIT;

  // Posting one more link requires (postsWithLink + 1) * ratio helpful replies.
  const requiredForNextLink = (postsWithLink + 1) * ratioTarget;
  const withinLimit = postsHelpful >= postsWithLink * ratioTarget;

  return {
    date: date.toISOString().slice(0, 10),
    postsWithLink,
    postsHelpful,
    totalPosts,
    ratioTarget,
    dailyLimit,
    withinLimit,
    paceWarning: totalPosts >= dailyLimit,
    recommendedHelpfulBeforeNextLink: Math.max(
      0,
      requiredForNextLink - postsHelpful,
    ),
  };
}

/** Record a posted reply against today's activity counters. */
export async function recordActivity(
  withLink: boolean,
  accountName = "me",
): Promise<void> {
  const date = todayUtc();
  await prisma.accountActivity.upsert({
    where: { accountName_date: { accountName, date } },
    update: withLink
      ? { postsWithLink: { increment: 1 } }
      : { postsHelpful: { increment: 1 } },
    create: {
      accountName,
      date,
      postsWithLink: withLink ? 1 : 0,
      postsHelpful: withLink ? 0 : 1,
    },
  });
}
