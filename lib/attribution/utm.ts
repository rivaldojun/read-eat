/**
 * UTM link construction + parsing.
 *
 * Convention (brief §3, §6): the free-scanner link carries
 *   ?utm_source=<source>&utm_medium=<medium>&utm_campaign=<opportunityId>
 * `utm_campaign` is ALWAYS the Opportunity id — it is the join key used by the
 * attribution pipeline (webhook + Stripe) to tie revenue back to a reply.
 */

export interface UtmParams {
  /** Human source, e.g. a subreddit name ("r/resumes") or "reddit". */
  source: string;
  /** Opportunity id (cuid). Used verbatim as the attribution join key. */
  campaign: string;
  /** Defaults to "community_comment". */
  medium?: string;
}

/** Lowercase + collapse non-alphanumerics to underscores (utm_source hygiene). */
export function slugifySource(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Append/overwrite UTM params on a base URL. Preserves any pre-existing query
 * params on the base and is safe to call on URLs that already have a query.
 */
export function buildTrackedUrl(baseUrl: string, params: UtmParams): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", slugifySource(params.source));
  url.searchParams.set("utm_medium", params.medium ?? "community_comment");
  // Campaign is the opportunity id — keep it exact, do not slugify.
  url.searchParams.set("utm_campaign", params.campaign);
  return url.toString();
}

/**
 * Extract utm_campaign (the opportunity id / attribution key) from a URL or a
 * raw query string. Returns null if absent or unparseable.
 */
export function extractUtmCampaign(input: string): string | null {
  try {
    const url = new URL(input);
    return url.searchParams.get("utm_campaign");
  } catch {
    // Not a full URL — try parsing as a query string fragment.
    const qIndex = input.indexOf("?");
    const query = qIndex >= 0 ? input.slice(qIndex + 1) : input;
    const value = new URLSearchParams(query).get("utm_campaign");
    return value && value.length > 0 ? value : null;
  }
}
