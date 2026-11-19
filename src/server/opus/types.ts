/**
 * Contracts of the Opus Off-Platform Task / Review (context §3).
 * The simulator and a real Opus integration use the same shapes.
 */
import { z } from "zod";
import type { TaskType } from "@/domain/types";

/** What Opus POSTs to the workspace webhook when a run pauses at an Off-Platform node. */
export interface OffPlatformPayload {
  execution_id: string;
  workflow_id: string;
  workflow_name: string;
  /** Not in the Opus payload itself: the app maps it from inputs / audit. Kept for the demo. */
  node_id: string;
  inputs: Record<string, unknown> & { task_type: TaskType };
  callback: { url: string; token: string; token_header: string };
  expected_output_schema: Record<string, { type: string; required?: boolean }>;
}

/** What the app sends back to `callback.url`. Values must be bare (never {value, type}). */
export type CallbackBody =
  | { status: "success"; output_data: Record<string, unknown> }
  | { status: "failed"; error: string };

/** 200 accepted · 401 token spent / run not waiting · 404 no such execution · 422 undeclared field. */
export interface CallbackResponse {
  status: 200 | 401 | 404 | 422;
  body: { ok?: boolean; error?: string; detail?: string };
}

export interface JobAudit {
  job_id: string;
  status: "IN PROGRESS" | "COMPLETED" | "FAILED";
  nb_nodes: number;
  executed_nodes: string[];
  running_node: string | null;
  failed_nodes: string[];
}

/**
 * What the real Opus Off-Platform node POSTs to the app webhook (spec 02 §6.5).
 * Inputs arrive flat, keyed by input ID: { "<id>": { "type": "str" | "float" | "date", "value": ... } }.
 */
const OpusValueSchema = z.object({ type: z.string(), value: z.unknown() }).passthrough();

export const OpusOffPlatformPayloadSchema = z
  .object({
    execution_id: z.string().min(1),
    workflow_id: z.string().min(1),
    workflow_name: z.string(),
    inputs: z.record(OpusValueSchema),
    callback: z.object({ url: z.string().url(), token: z.string().min(1), token_header: z.string().min(1) }),
    expected_output_schema: z
      .record(z.object({ type: z.string(), is_nullable: z.boolean().optional() }).passthrough())
      .default({}),
  })
  .passthrough();

export type OpusOffPlatformPayload = z.infer<typeof OpusOffPlatformPayloadSchema>;
