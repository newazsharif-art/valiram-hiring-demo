import { currentUser, handle } from "@/server/http";
import { ApiError, db } from "@/server/service";

export const dynamic = "force-dynamic";

/**
 * Last 20 requests received on /api/opus/webhook (newest first), for checking what Opus sent.
 * Secrets in the URL and headers and callback.token are masked. HR users only.
 */
export async function GET() {
  const u = await currentUser();
  return handle(() => {
    if (u.role === "HIRING_MANAGER") throw new ApiError(403, "forbidden", "Switch to an HR user to view the webhook log.");
    return db().opus_webhook_log ?? [];
  });
}
