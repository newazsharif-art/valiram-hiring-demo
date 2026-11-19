import { currentUser, handle } from "@/server/http";
import { ApiError, db } from "@/server/service";
import { getCaseAudit, getCaseStatus, OpusApiError } from "@/server/opus/caseClient";

export const dynamic = "force-dynamic";

/**
 * Debugging: the real Opus case behind a requisition, read with the server-side service key.
 *   GET /api/opus/cases/REQ-2611-012/audit
 * Returns the case status and the per-node audit (Opus v1 Case API). HR users only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ reqId: string }> }) {
  const { reqId } = await params;
  const u = await currentUser();
  return handle(async () => {
    if (u.role === "HIRING_MANAGER") throw new ApiError(403, "forbidden", "Switch to an HR user to view Opus case details.");
    const rec = db().opus_cases[reqId];
    if (!rec) throw new ApiError(404, "no_case", `${reqId} has no Opus case.`);
    const call = async (fn: () => Promise<Record<string, unknown>>) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof OpusApiError) return { error: e.kind, http_status: e.httpStatus, body: e.body };
        throw e;
      }
    };
    return {
      requisition_id: reqId,
      case_id: rec.case_id,
      execution_ids: rec.execution_ids ?? [],
      status: await call(() => getCaseStatus(rec.case_id)),
      audit: await call(() => getCaseAudit(rec.case_id)),
    };
  });
}
