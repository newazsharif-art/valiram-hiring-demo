import { createHash, timingSafeEqual } from "node:crypto";
import { handle } from "@/server/http";
import type { Db, OpusWebhookLogEntry } from "@/server/store";
import { nowIso } from "@/server/store";
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

const MASK = "***";
const SECRET_PARAMS = ["secret", "x-vercel-protection-bypass"];
const SECRET_HEADERS = [SECRET_HEADER, "x-vercel-protection-bypass", "authorization", "cookie", "x-service-key"];
const LOG_SIZE = 20;

function maskedUrl(url: URL): string {
  const u = new URL(url.toString());
  for (const k of SECRET_PARAMS) if (u.searchParams.has(k)) u.searchParams.set(k, MASK);
  return `${u.pathname}${u.search}`;
}

function maskedHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k] = SECRET_HEADERS.includes(k.toLowerCase()) ? MASK : v;
  });
  return out;
}

function maskedBody(text: string): unknown {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const cb = json?.callback as Record<string, unknown> | undefined;
    if (cb && typeof cb === "object" && "token" in cb) json.callback = { ...cb, token: MASK };
    return json;
  } catch {
    return text.slice(0, 4000);
  }
}

/**
 * Real Opus Off-Platform webhook (spec 02 §6).
 *   POST /api/opus/webhook?node=hm_review_r1
 *   Header X-Valiram-Webhook-Secret: <OPUS_WEBHOOK_SECRET>
 *   (or, if the node can't send headers: ...&secret=<OPUS_WEBHOOK_SECRET>; the header wins when both are sent)
 * Stores execution_id + callback (Opus never resends them), creates the task, answers 200 fast.
 * No user cookie: Opus is the caller. Every request is recorded (secrets masked): GET /api/opus/webhook/log.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const node = url.searchParams.get("node") ?? "";
  // Header first; `?secret=` is a fallback for when the Opus node can't send custom headers (spec 02 §4.1).
  const sentSecret = req.headers.get(SECRET_HEADER) ?? url.searchParams.get("secret");
  const text = await req.text().catch(() => "");
  return handle(async () => {
    const d = db();
    // Record every request (also rejected ones) so the received payload can be inspected: GET /api/opus/webhook/log.
    const entry: OpusWebhookLogEntry = { at: nowIso(), url: maskedUrl(url), headers: maskedHeaders(req), body: maskedBody(text), status: 0, result: "" };
    d.opus_webhook_log = [entry, ...(d.opus_webhook_log ?? [])].slice(0, LOG_SIZE);
    try {
      const out = receive(d, node, sentSecret, text);
      entry.status = 200;
      entry.result = `task ${out.task_id}`;
      return out;
    } catch (e) {
      entry.status = e instanceof ApiError ? e.status : 500;
      entry.result = e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
      throw e;
    }
  });
}

function receive(d: Db, node: string, sentSecret: string | null, text: string) {
  const secret = process.env.OPUS_WEBHOOK_SECRET?.trim();
  if (opusIntegration() !== "on" || !secret) {
    console.error("[opus] webhook: integration not configured (OPUS_SERVICE_KEY, OPUS_CREATE_REQUISITION_WORKFLOW_ID, OPUS_WEBHOOK_SECRET).");
    throw new ApiError(503, "opus_not_configured", "The Opus integration is not configured.");
  }
  if (!secretMatches(sentSecret, secret)) {
    console.error(`[opus] webhook node=${node || "(none)"}: missing or wrong secret (header or ?secret=). Rejected with 401.`);
    throw new ApiError(401, "unauthorized", "Missing or wrong webhook secret.");
  }
  if (!OPUS_NODES[node]) {
    console.error(`[opus] webhook node=${node || "(none)"}: unknown node. Rejected with 400.`);
    throw new ApiError(400, "unknown_node", "Unknown or missing node parameter.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be JSON");
  }
  const parsed = OpusOffPlatformPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`[opus] webhook node=${node}: invalid payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    throw new ApiError(400, "invalid_payload", "The webhook body is not a valid Off-Platform payload.");
  }
  const p = parsed.data;
  if (p.workflow_id !== process.env.OPUS_CREATE_REQUISITION_WORKFLOW_ID?.trim()) {
    console.error(`[opus] webhook node=${node} execution_id=${p.execution_id}: unexpected workflow_id ${p.workflow_id}. Rejected with 400.`);
    throw new ApiError(400, "wrong_workflow", "The webhook is for another workflow.");
  }
  const { task } = receiveOpusTask(d, node, p);
  return { ok: true, task_id: task.id };
}
