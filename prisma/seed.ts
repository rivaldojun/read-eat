/**
 * Seed: source list + demo data spanning every Opportunity status so the
 * inbox and analytics render without any live API calls.
 *
 * Idempotent: uses fixed ids + upserts, safe to run repeatedly.
 * Run with: npm run db:seed
 */
import { PrismaClient, SourceType, OppStatus } from "@prisma/client";
import { buildTrackedUrl } from "../lib/attribution/utm";

const prisma = new PrismaClient();

const SCANNER_URL =
  process.env.FUTUROLE_SCANNER_URL || "https://futurole.com/ats-scan";

const REDDIT_SOURCES: { id: string; name: string; keywords: string[] }[] = [
  {
    id: "src-resumes",
    name: "r/resumes",
    keywords: ["resume", "cv", "ats", "feedback", "review", "rejected"],
  },
  {
    id: "src-jobs",
    name: "r/jobs",
    keywords: ["resume", "application", "no callbacks", "ghosted", "rejected"],
  },
  {
    id: "src-cscq",
    name: "r/cscareerquestions",
    keywords: ["resume", "ats", "no interviews", "applications", "rejected"],
  },
  {
    id: "src-engresumes",
    name: "r/EngineeringResumes",
    keywords: ["resume", "ats", "review", "feedback", "format"],
  },
  {
    id: "src-recruitinghell",
    name: "r/recruitinghell",
    keywords: ["ats", "resume", "ghosted", "rejected", "auto-reject"],
  },
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("🌱 Seeding sources…");
  for (const s of REDDIT_SOURCES) {
    await prisma.source.upsert({
      where: { type_name: { type: SourceType.REDDIT, name: s.name } },
      update: { keywords: s.keywords, enabled: true },
      create: {
        id: s.id,
        type: SourceType.REDDIT,
        name: s.name,
        keywords: s.keywords,
        enabled: true,
      },
    });
  }

  // Discord source — present but disabled (v2).
  await prisma.source.upsert({
    where: {
      type_name: { type: SourceType.DISCORD, name: "Tech Job Seekers (v2)" },
    },
    update: { enabled: false },
    create: {
      id: "src-discord-stub",
      type: SourceType.DISCORD,
      name: "Tech Job Seekers (v2)",
      keywords: ["resume", "ats"],
      enabled: false,
    },
  });

  console.log("🌱 Seeding demo opportunities…");

  // 1) Fresh, un-triaged.
  await prisma.opportunity.upsert({
    where: { externalId: "demo_t1_new" },
    update: {},
    create: {
      id: "seed-opp-new",
      externalId: "demo_t1_new",
      sourceId: "src-jobs",
      permalink: "https://reddit.com/r/jobs/comments/demo_t1_new",
      author: "throwaway_jobhunt",
      title: "300 applications, 0 callbacks — what am I doing wrong?",
      body: "I've been applying for 3 months to backend roles and never hear back. I think my resume might be getting filtered out automatically. Not sure where to even start fixing it.",
      postedAt: daysAgo(0),
      signals: ["resume", "no callbacks"],
      status: OppStatus.NEW,
    },
  });

  // 2) Triaged, awaiting draft.
  await prisma.opportunity.upsert({
    where: { externalId: "demo_t2_triaged" },
    update: {},
    create: {
      id: "seed-opp-triaged",
      externalId: "demo_t2_triaged",
      sourceId: "src-cscq",
      permalink: "https://reddit.com/r/cscareerquestions/comments/demo_t2_triaged",
      author: "newgrad2026",
      title: "New grad, 0 interviews from 150 apps — resume check?",
      body: "Graduated in CS last year. 150 applications, not a single interview. Can someone tell me if my resume is ATS-friendly? Happy to share.",
      postedAt: daysAgo(1),
      signals: ["resume", "ats", "no interviews"],
      intentScore: 82,
      persona: "junior",
      pain: "Resume likely filtered by ATS; no interview pipeline.",
      status: OppStatus.TRIAGED,
    },
  });

  // 3) + 4) Drafted (ready for the inbox).
  const drafted = [
    {
      id: "seed-opp-drafted-a",
      externalId: "demo_t3_drafted_a",
      sourceId: "src-resumes",
      sourceName: "r/resumes",
      permalink: "https://reddit.com/r/resumes/comments/demo_t3_drafted_a",
      author: "career_switcher",
      title: "Switching from teaching to data analytics — resume feedback?",
      body: "After 6 years teaching I'm moving into data analytics. I reworked my resume but I'm worried it doesn't pass ATS keyword checks for analyst roles. Any feedback appreciated!",
      signals: ["resume", "ats", "feedback"],
      intentScore: 91,
      persona: "career-change",
      pain: "Career-changer unsure if resume keywords match target roles / ATS.",
    },
    {
      id: "seed-opp-drafted-b",
      externalId: "demo_t4_drafted_b",
      sourceId: "src-engresumes",
      sourceName: "r/EngineeringResumes",
      permalink: "https://reddit.com/r/EngineeringResumes/comments/demo_t4_drafted_b",
      author: "senior_dev_burned",
      title: "Senior eng, plenty of experience but no responses — format issue?",
      body: "10 YOE backend engineer. I get almost no responses. People say my resume is too dense and maybe the format breaks ATS parsing. Looking for concrete fixes.",
      signals: ["resume", "ats", "format"],
      intentScore: 76,
      persona: "senior",
      pain: "Dense resume, possible ATS parsing breakage, low response rate.",
    },
  ];

  for (const o of drafted) {
    await prisma.opportunity.upsert({
      where: { externalId: o.externalId },
      update: {},
      create: {
        id: o.id,
        externalId: o.externalId,
        sourceId: o.sourceId,
        permalink: o.permalink,
        author: o.author,
        title: o.title,
        body: o.body,
        postedAt: daysAgo(2),
        signals: o.signals,
        intentScore: o.intentScore,
        persona: o.persona,
        pain: o.pain,
        status: OppStatus.DRAFTED,
      },
    });

    const link = buildTrackedUrl(SCANNER_URL, {
      source: o.sourceName,
      campaign: o.id,
    });

    await prisma.draft.upsert({
      where: { opportunityId: o.id },
      update: {},
      create: {
        opportunityId: o.id,
        utmCampaign: o.id,
        includesLink: true,
        variantA: `Quick read on your post — the symptoms you describe (no responses despite volume) usually point at two things: keyword alignment with the job description and parse-ability of the layout. A couple of concrete checks: 1) make sure your most recent role's bullets echo the exact terms from the postings you target, 2) drop multi-column layouts and text boxes, which many ATS mangle. If it helps, I built a free ATS scanner that flags exactly these issues line by line — no signup needed: ${link}`,
        variantB: `This is a really common pattern and it's fixable. Two highest-leverage moves: (a) mirror the job description's hard skills in your bullets (ATS often ranks on keyword match), and (b) single-column, standard headings so the parser reads it cleanly. Want a fast diagnostic? This free scanner shows your ATS score + the missing keywords instantly: ${link}`,
      },
    });
  }

  // 5) Posted + attributed (revenue demo).
  await prisma.opportunity.upsert({
    where: { externalId: "demo_t5_posted" },
    update: {},
    create: {
      id: "seed-opp-posted",
      externalId: "demo_t5_posted",
      sourceId: "src-recruitinghell",
      permalink: "https://reddit.com/r/recruitinghell/comments/demo_t5_posted",
      author: "ghosted_again",
      title: "Auto-rejected within 2 minutes — is my resume even read?",
      body: "Got an auto-rejection literally 2 minutes after applying. Pretty sure an ATS is nuking my resume before a human sees it. How do I get past it?",
      postedAt: daysAgo(5),
      signals: ["ats", "auto-reject", "resume"],
      intentScore: 88,
      persona: "junior",
      pain: "ATS auto-rejecting before human review.",
      status: OppStatus.POSTED,
    },
  });

  const postedLink = buildTrackedUrl(SCANNER_URL, {
    source: "r/recruitinghell",
    campaign: "seed-opp-posted",
  });

  await prisma.postedReply.upsert({
    where: { opportunityId: "seed-opp-posted" },
    update: {},
    create: {
      opportunityId: "seed-opp-posted",
      utmCampaign: "seed-opp-posted",
      clicks: 12,
      postedAt: daysAgo(5),
      finalText: `A 2-minute rejection almost always means an ATS keyword/format filter, not a human. Two fixes that move the needle most: mirror the posting's hard skills in your bullets, and use a single-column layout with standard section headings. If you want to see exactly what an ATS extracts from your file, this free scanner shows your score and missing keywords: ${postedLink}`,
    },
  });

  await prisma.attribution.upsert({
    where: { postedReplyId: (await prisma.postedReply.findUniqueOrThrow({ where: { opportunityId: "seed-opp-posted" } })).id },
    update: { signups: 4, trials: 2, paidUsers: 1, mrrCents: 1900 },
    create: {
      postedReplyId: (await prisma.postedReply.findUniqueOrThrow({ where: { opportunityId: "seed-opp-posted" } })).id,
      signups: 4,
      trials: 2,
      paidUsers: 1,
      mrrCents: 1900,
    },
  });

  // 6) Skipped (off-topic / low intent).
  await prisma.opportunity.upsert({
    where: { externalId: "demo_t6_skipped" },
    update: {},
    create: {
      id: "seed-opp-skipped",
      externalId: "demo_t6_skipped",
      sourceId: "src-jobs",
      permalink: "https://reddit.com/r/jobs/comments/demo_t6_skipped",
      author: "ranting_user",
      title: "Just venting about my horrible manager",
      body: "Not looking for advice, just need to rant about how toxic my workplace is. No resume stuff here.",
      postedAt: daysAgo(3),
      signals: [],
      intentScore: 18,
      persona: null,
      pain: "Off-topic venting, no job-search intent.",
      status: OppStatus.SKIPPED,
    },
  });

  // Anti-ban guardrail demo row for today.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.accountActivity.upsert({
    where: { accountName_date: { accountName: "me", date: today } },
    update: {},
    create: {
      accountName: "me",
      date: today,
      postsWithLink: 1,
      postsHelpful: 3,
    },
  });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
