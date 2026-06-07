/**
 * Single-user password gate (brief §4). No OAuth. The session cookie stores a
 * SHA-256 token derived from APP_PASSWORD, never the password itself. Uses Web
 * Crypto so it runs in both the Edge middleware and Node route handlers.
 */
export const SESSION_COOKIE = "fr_session";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The expected cookie value for a given password. */
export function expectedSessionToken(password: string): Promise<string> {
  return sha256Hex(`futurole-growth-copilot::${password}`);
}
