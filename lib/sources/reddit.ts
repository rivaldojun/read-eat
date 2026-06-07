import Snoowrap from "snoowrap";
import { SourceType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env, requireEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { redditLimiter } from "@/lib/rate-limit";
import { matchKeywords } from "@/lib/sources/match";
import { ingestOpportunities } from "@/lib/sources/ingest";
import type { RawPost, IngestResult } from "@/lib/sources/types";

const POSTS_PER_SUBREDDIT = 50;

let client: Snoowrap | null = null;

function getClient(): Snoowrap {
  if (client) return client;
  client = new Snoowrap({
    userAgent: requireEnv("REDDIT_USER_AGENT"),
    clientId: requireEnv("REDDIT_CLIENT_ID"),
    clientSecret: requireEnv("REDDIT_CLIENT_SECRET"),
    username: requireEnv("REDDIT_USERNAME"),
    password: requireEnv("REDDIT_PASSWORD"),
  });
  // snoowrap self-throttles using Reddit's ratelimit headers.
  client.config({
    requestDelay: 1000,
    continueAfterRatelimitError: false,
    maxRetryAttempts: 2,
    warnings: false,
  });
  return client;
}

function normalizeSubreddit(name: string): string {
  return name.replace(/^\/?r\//i, "").trim();
}

/** Fetch recent posts from a subreddit and keep only those matching keywords. */
async function fetchSubredditPosts(
  name: string,
  keywords: string[],
): Promise<RawPost[]> {
  await redditLimiter.acquire();
  const sub = normalizeSubreddit(name);
  const submissions = await getClient()
    .getSubreddit(sub)
    .getNew({ limit: POSTS_PER_SUBREDDIT });

  const posts: RawPost[] = [];
  for (const s of submissions) {
    const title = s.title ?? "";
    const body = s.selftext ?? "";
    const signals = matchKeywords(`${title}\n${body}`, keywords);
    if (signals.length === 0) continue;
    posts.push({
      externalId: `reddit_${s.id}`,
      permalink: `https://www.reddit.com${s.permalink}`,
      author: s.author?.name ?? "[deleted]",
      title,
      body,
      postedAt: new Date(s.created_utc * 1000),
      signals,
    });
  }
  return posts;
}

/** Deterministic fixtures for dev/CI when RADAR_MOCK=true (no live Reddit). */
function mockPosts(name: string, keywords: string[]): RawPost[] {
  const slug = normalizeSubreddit(name);
  const samples = [
    {
      id: "m1",
      title: `Is my resume ATS-friendly? Keep getting rejected`,
      body: "Applied to 200+ roles, no callbacks. I think the ATS filters my resume. Would love a review.",
    },
    {
      id: "m2",
      title: `No interviews after months of applications`,
      body: "My applications get auto-rejected. Is it a resume format / ats keyword issue?",
    },
    {
      id: "m3",
      title: `Career change — resume and cv feedback please`,
      body: "Switching careers and unsure my cv keywords match the job description. Any feedback?",
    },
  ];
  return samples.map((s) => {
    const signals = matchKeywords(`${s.title}\n${s.body}`, keywords);
    return {
      externalId: `reddit_mock_${slug}_${s.id}`,
      permalink: `https://www.reddit.com/${name}/comments/mock_${s.id}`,
      author: `mock_user_${s.id}`,
      title: s.title,
      body: s.body,
      postedAt: new Date(),
      signals: signals.length > 0 ? signals : keywords.slice(0, 1),
    };
  });
}

/**
 * Collect opportunities from every enabled REDDIT source, dedup-inserting them
 * as NEW. Each source is isolated so one failure doesn't abort the run.
 */
export async function collectRedditOpportunities(): Promise<IngestResult[]> {
  const sources = await prisma.source.findMany({
    where: { type: SourceType.REDDIT, enabled: true },
  });

  const useMock = env.RADAR_MOCK === "true";
  if (useMock) {
    log.warn("radar:reddit", "RADAR_MOCK=true — using fixtures, not live Reddit");
  }

  const results: IngestResult[] = [];
  for (const source of sources) {
    try {
      const posts = useMock
        ? mockPosts(source.name, source.keywords)
        : await fetchSubredditPosts(source.name, source.keywords);
      const { inserted, skipped } = await ingestOpportunities(source.id, posts);
      log.info("radar:reddit", "collected", {
        source: source.name,
        fetched: posts.length,
        inserted,
        skipped,
      });
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        fetched: posts.length,
        inserted,
        skipped,
      });
    } catch (err) {
      log.error("radar:reddit", "source failed", {
        source: source.name,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        fetched: 0,
        inserted: 0,
        skipped: 0,
      });
    }
  }
  return results;
}
