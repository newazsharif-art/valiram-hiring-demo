/**
 * Header filter for the Opus webhook request log (GET /api/opus/webhook/log).
 * Only headers that help debugging and carry no credentials are kept; Vercel adds several
 * that do (OIDC token, proxy signatures, x-vercel-sc-headers), so this is an allowlist.
 */
import "server-only";

const KEEP = new Set([
  "content-type",
  "content-length",
  "user-agent",
  "host",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-ip-country",
  "x-vercel-id",
  "x-vercel-deployment-url",
]);

/** Allowlisted headers as sent; any other header name is listed with its value hidden. */
export function safeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = KEEP.has(k.toLowerCase()) ? v : "***";
  return out;
}
