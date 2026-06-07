/**
 * Keyword matching for the radar. Case-insensitive substring match so
 * multi-word signals like "no callbacks" work. Returns the subset of keywords
 * that appear in the text (deduped, original order preserved).
 */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const haystack = text.toLowerCase();
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const kw of keywords) {
    const needle = kw.toLowerCase().trim();
    if (needle && haystack.includes(needle) && !seen.has(needle)) {
      seen.add(needle);
      matched.push(kw);
    }
  }
  return matched;
}
