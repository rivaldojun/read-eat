import { prisma } from "@/lib/db";

/**
 * Record a signup attributed to a posted reply, matched by utm_campaign
 * (= opportunity id). Idempotent at the row level via upsert; each call
 * increments signups by one. Returns whether a matching reply was found.
 */
export async function recordSignup(
  utmCampaign: string,
): Promise<{ matched: boolean }> {
  const posted = await prisma.postedReply.findFirst({
    where: { utmCampaign },
  });
  if (!posted) return { matched: false };

  await prisma.attribution.upsert({
    where: { postedReplyId: posted.id },
    update: { signups: { increment: 1 } },
    create: { postedReplyId: posted.id, signups: 1 },
  });
  return { matched: true };
}
