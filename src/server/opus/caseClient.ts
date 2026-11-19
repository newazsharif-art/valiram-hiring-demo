/**
 * Real Opus v1 Case API client (server-side only).
 * Docs: https://developer.opus.com/api-reference/v1-case/initiate-case
 *       https://developer.opus.com/api-reference/v1-case/execute-case
 */
import "server-only";

const TIMEOUT_MS = 10_000;

export type OpusStep = "initiate" | "execute";
/** bad_response = unreadable or incomplete answer; rejected = Opus answered but did not accept the request. */
export type OpusErrorKind = "network" | "timeout" | "http" | "bad_response" | "rejected";

export class OpusApiError extends Error {
  constructor(
    public step: OpusStep,
    public kind: OpusErrorKind,
    message: string,
    public httpStatus?: number,
    /** Opus response body, truncated. For server logs only. */
    public body?: string,
  ) {
    super(message);
  }
}

export interface OpusPayloadValue {
  value: string | number;
  type: "str" | "float" | "date";
  displayName: string;
}

export type OpusPayload = Record<string, OpusPayloadValue>;

function baseUrl(): string {
  return (process.env.OPUS_BASE_URL || "https://operator.opus.com").replace(/\/+$/, "");
}

async function post(step: OpusStep, path: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": process.env.OPUS_SERVICE_KEY ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new OpusApiError(step, "timeout", `Opus ${step} timed out after ${TIMEOUT_MS} ms`);
    }
    throw new OpusApiError(step, "network", `Opus ${step} request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new OpusApiError(step, "http", `Opus ${step} returned HTTP ${res.status}`, res.status, text.slice(0, 500));
  }
  try {
    const json = JSON.parse(text) as unknown;
    if (json && typeof json === "object") return json as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new OpusApiError(step, "bad_response", `Opus ${step} returned a non-JSON body`, res.status, text.slice(0, 500));
}

/** POST /api/v1/case → caseId. */
export async function initiateCase(p: { workflowId: string; title: string; description: string }): Promise<string> {
  const json = await post("initiate", "/api/v1/case", p);
  if (typeof json.caseId !== "string" || !json.caseId) {
    throw new OpusApiError("initiate", "bad_response", "Opus initiate response has no caseId", undefined, JSON.stringify(json).slice(0, 500));
  }
  return json.caseId;
}

/** POST /api/v1/case/{caseId}/execute. Asynchronous on the Opus side: returns once the run is queued. */
export async function executeCase(caseId: string, payload: OpusPayload): Promise<void> {
  const json = await post("execute", `/api/v1/case/${encodeURIComponent(caseId)}/execute`, { payload });
  if (json.success !== true) {
    throw new OpusApiError("execute", "rejected", "Opus execute response did not report success", undefined, JSON.stringify(json).slice(0, 500));
  }
}
