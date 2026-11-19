/**
 * App side: sends the Off-Platform callback for a task.
 * The path is chosen by the task's source (spec 02 §7.3), not DATA_MODE:
 *  - "opus" → POST {callback.url} (= {OPUS_BASE_URL}/v1/execution/callback/{execution_id}) with the token header;
 *  - "sim" or missing → the in-process Opus simulator.
 */
import "server-only";
import type { TaskRecord } from "@/domain/types";
import type { Db } from "../store";
import type { CallbackBody, CallbackResponse } from "../opus/types";
import { receiveCallback } from "../opus/simulator";
import { baseUrl, TIMEOUT_MS } from "../opus/caseClient";
import { ApiError } from "../service";

export function dataMode(): "mock" | "opus" {
  return process.env.DATA_MODE === "opus" ? "opus" : "mock";
}

const SEND_FAILED = "We couldn't send your changes to Opus. Please try again.";

/** The callback URL of an Opus task: the one Opus gave us, or built from its execution_id. */
export function callbackUrl(task: TaskRecord): string {
  return task.callback.url || `${baseUrl()}/v1/execution/callback/${encodeURIComponent(task.execution_id)}`;
}

export async function sendCallback(db: Db, task: TaskRecord, body: CallbackBody): Promise<CallbackResponse> {
  if (task.source !== "opus") {
    return receiveCallback(db, task.execution_id, task.callback.token, body);
  }
  const tag = `[opus] callback task=${task.id} execution_id=${task.execution_id}`;
  let res: Response;
  try {
    res = await fetch(callbackUrl(task), {
      method: "POST",
      headers: { "content-type": "application/json", [task.callback.token_header || "X-Opus-Callback-Token"]: task.callback.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      console.error(`${tag}: timed out after ${TIMEOUT_MS} ms`);
      throw new ApiError(504, "opus_timeout", SEND_FAILED);
    }
    console.error(`${tag}: request failed: ${e instanceof Error ? e.message : String(e)}`);
    throw new ApiError(502, "opus_unavailable", SEND_FAILED);
  }
  const text = await res.text().catch(() => "");
  let json: CallbackResponse["body"] = {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") json = parsed as CallbackResponse["body"];
  } catch {
    // non-JSON body: keep {}
  }
  console.info(`${tag}: HTTP ${res.status}`);
  if (res.status === 200 || res.status === 201 || res.status === 204) return { status: 200, body: json };
  if (res.status === 401 || res.status === 404) return { status: res.status, body: json };
  if (res.status === 422) {
    console.error(`${tag}: Opus rejected the output (422): ${text.slice(0, 500)}`);
    return {
      status: 422,
      body: { error: "opus_rejected_output", detail: "Opus didn't accept the changes, so nothing was saved. Please contact your system administrator." },
    };
  }
  console.error(`${tag}: unexpected HTTP ${res.status}: ${text.slice(0, 500)}`);
  throw new ApiError(502, "opus_unavailable", SEND_FAILED);
}
