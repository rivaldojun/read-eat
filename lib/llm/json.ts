/**
 * Robust extraction of a single JSON object from an LLM response. Handles the
 * common failure modes even when responseMimeType=application/json is set:
 * markdown code fences and leading/trailing prose.
 */
export function extractJsonObject(text: string): string {
  let t = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  // Narrow to the outermost { ... } if there is surrounding prose.
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return t;
}
