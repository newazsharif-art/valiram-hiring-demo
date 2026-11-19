/**
 * App side: sends the Off-Platform callback for a task.
 * DATA_MODE=mock -> the in-process Opus simulator.
 * DATA_MODE=opus -> POST callback.url with the token header (sketch below; not used in the demo).
 */
import "server-only";
import type { TaskRecord } from "@/domain/types";
import type { Db } from "../store";
import type { CallbackBody, CallbackResponse } from "../opus/types";
import { receiveCallback } from "../opus/simulator";

export function dataMode(): "mock" | "opus" {
  return process.env.DATA_MODE === "opus" ? "opus" : "mock";
}

export async function sendCallback(db: Db, task: TaskRecord, body: CallbackBody): Promise<CallbackResponse> {
  if (dataMode() === "mock") {
    return receiveCallback(db, task.execution_id, task.callback.token, body);
  }
  // Real Opus (not wired in the demo):
  const res = await fetch(task.callback.url, {
    method: "POST",
    headers: { "content-type": "application/json", [task.callback.token_header]: task.callback.token },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CallbackResponse["body"];
  const status = ([200, 401, 404, 422] as const).find((s) => s === res.status) ?? 422;
  return { status, body: json };
}
