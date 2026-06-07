/** Normalised post shape produced by any source (Reddit, later Discord). */
export interface RawPost {
  /** Globally-unique, source-prefixed id used for dedup, e.g. "reddit_abc123". */
  externalId: string;
  permalink: string;
  author: string;
  title: string | null;
  body: string;
  postedAt: Date;
  /** Keywords from the Source that matched this post. */
  signals: string[];
}

/** Per-source ingestion result. */
export interface IngestResult {
  sourceId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  skipped: number;
}
