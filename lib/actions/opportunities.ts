import { z } from "zod";
import { OppStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/guardrail";

/** Zod schema for actions that carry the final (possibly edited) reply text. */
export const FinalTextSchema = z.object({
  finalText: z.string().trim().min(1, "finalText is required").max(10000),
});

/** Does the reply contain a link? Drives the anti-ban ratio counters. */
export function replyHasLink(text: string): boolean {
  return /https?:\/\//i.test(text);
}

/**
 * Approve: mark APPROVED and persist the approved text into the draft
 * (variantA) so an edit survives a refresh. The reviewer still posts manually.
 */
export async function approveOpportunity(id: string, finalText: string) {
  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: { draft: true },
  });
  if (!opp) throw new Error("Opportunity not found");

  await prisma.$transaction([
    ...(opp.draft
      ? [
          prisma.draft.update({
            where: { opportunityId: id },
            data: { variantA: finalText, includesLink: replyHasLink(finalText) },
          }),
        ]
      : []),
    prisma.opportunity.update({
      where: { id },
      data: { status: OppStatus.APPROVED },
    }),
  ]);

  return { id, status: OppStatus.APPROVED };
}

/** Skip: mark SKIPPED (off-topic, not worth replying, etc.). */
export async function skipOpportunity(id: string) {
  await prisma.opportunity.update({
    where: { id },
    data: { status: OppStatus.SKIPPED },
  });
  return { id, status: OppStatus.SKIPPED };
}

/**
 * Mark as posted: record the final text I actually posted manually, set POSTED,
 * ensure an Attribution row exists, and update the anti-ban counters. This is
 * the ONLY place a reply is "committed" — and even here nothing is published by
 * the app; I post it by hand and then click this.
 */
export async function markPosted(id: string, finalText: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id } });
  if (!opp) throw new Error("Opportunity not found");

  const withLink = replyHasLink(finalText);

  const posted = await prisma.postedReply.upsert({
    where: { opportunityId: id },
    update: { finalText, utmCampaign: id, postedAt: new Date() },
    create: { opportunityId: id, finalText, utmCampaign: id },
  });

  await prisma.attribution.upsert({
    where: { postedReplyId: posted.id },
    update: {},
    create: { postedReplyId: posted.id },
  });

  await prisma.opportunity.update({
    where: { id },
    data: { status: OppStatus.POSTED },
  });

  await recordActivity(withLink);

  return { id, status: OppStatus.POSTED, withLink };
}
