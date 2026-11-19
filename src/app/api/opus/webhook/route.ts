import { createHash, timingSafeEqual } from "node:crypto";
import { handle, readJson } from "@/server/http";
import { ApiError, db } from "@/server/service";
import { OpusOffPlatformPayloadSchema } from "@/server/opus/types";
import { OPUS_NODES } from "@/server/app/opusNodes";
import { receiveOpusTask } from "@/server/app/webhook";
import { opusIntegration } from "@/server/app/createRequisitionCase";

export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-valiram-webhook-secret";

function secretMatches(sent: string | null, expected: string): boolean {
  if (!sent) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(sent).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Real Opus Off-Platform webhook (spec 02 §6).
 *   POST /api/opus/webhook?node=hm_review_r1
 *   Header X-Valiram-Webhook-Secret: <OPUS_WEBHOOK_SECRET>
 * Stores execution_id + callback (Opus never resends them), creates the task, answers 200 fast.
 * No user cookie: Opus is the caller.
 */
export async function POST(req: Request) {
  const node = new URL(req.url).searchParams.get("node") ?? "";
  return handle(async () => {
    const secret = process.env.OPUS_WEBHOOK_SECRET?.trim();
    if (opusIntegration() !== "on" || !secret) {
      console.error("[opus] webhook: integration not configured (OPUS_SERVICE_KEY, OPUS_CREATE_REQUISITION_WORKFLOW_ID, OPUS_WEBHOOK_SECRET).");
      throw new ApiError(503, "opus_not_configured", "The Opus integration is not configured.");
    }
    if (!secretMatches(req.headers.get(SECRET_HEADER), secret)) {
      console.error(`[opus] webhook node=${node || "(none)"}: missing or wrong secret header. Rejected with 401.`);
      throw new ApiError(401, "unauthorized", "Missing or wrong webhook secret.");
    }
    if (!OPUS_NODES[node]) {
      console.error(`[opus] webhook node=${node || "(none)"}: unknown node. Rejected with 400.`);
      throw new ApiError(400, "unknown_node", "Unknown or missing node parameter.");
    }
    const parsed = OpusOffPlatformPayloadSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      console.error(`[opus] webhook node=${node}: invalid payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      throw new ApiError(400, "invalid_payload", "The webhook body is not a valid Off-Platform payload.");
    }
    const p = parsed.data;
    if (p.workflow_id !== process.env.OPUS_CREATE_REQUISITION_WORKFLOW_ID?.trim()) {
      console.error(`[opus] webhook node=${node} execution_id=${p.execution_id}: unexpected workflow_id ${p.workflow_id}. Rejected with 400.`);
      throw new ApiError(400, "wrong_workflow", "The webhook is for another workflow.");
    }
    const { task } = receiveOpusTask(db(), node, p);
    return { ok: true, task_id: task.id };
  });
}
