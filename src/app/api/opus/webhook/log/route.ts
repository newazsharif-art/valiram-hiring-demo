import { currentUser, handle } from "@/server/http";
import { ApiError, db } from "@/server/service";
import { safeHeaders } from "@/server/app/webhookLog";

export const dynamic = "force-dynamic";

/**
 * Last 20 requests received on /api/opus/webhook (newest first), for checking what Opus sent.
 * Secrets in the URL and headers and callback.token are masked. HR users only.
 */
export async function GET() {
  const u = await currentUser();
  return handle(() => {
    if (u.role === "HIRING_MANAGER") throw new ApiError(403, "forbidden", "Switch to an HR user to view the webhook log.");
    // Filter again on read, so entries stored before the allowlist existed are hidden too.
    return (db().opus_webhook_log ?? []).map((e) => ({ ...e, headers: safeHeaders(e.headers) }));
  });
}
