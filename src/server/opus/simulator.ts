/**
 * Opus simulator: plays the Opus side in the demo (DATA_MODE=mock).
 *
 * - startJob()              ~ Jobs API initiate-job + execute-job
 * - pauseOffPlatform()      ~ an Off-Platform node: Opus POSTs the webhook payload to the app
 * - receiveCallback()       ~ Opus' callback endpoint (single-use token, 401 / 404 / 422 rules)
 * - getAudit()              ~ GET /job/{id}/audit (no timestamps, like the real one)
 *
 * The workflow logic itself (what happens after each node) lives in ../flows.ts.
 */
import "server-only";
import { randomUUID } from "crypto";
import type { TaskType } from "@/domain/types";
import { OUTPUT_SCHEMAS } from "@/domain/fixtures";
import type { Db, SimJob } from "../store";
import type { CallbackBody, CallbackResponse, JobAudit, OffPlatformPayload } from "./types";
import { receiveOffPlatformTask } from "../app/webhook";
import { onOffPlatformOutput } from "../flows";

const WORKFLOWS = {
  flow1: { id: "wf-flow1", name: "Flow 1 · Publish JD", nodes: 14 },
  flow1b: { id: "wf-flow1b", name: "Flow 1b · Shortlist", nodes: 7 },
} as const;

export function newJobId(): string {
  const h = randomUUID().replace(/-/g, "");
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`;
}

export function startJob(db: Db, workflow: keyof typeof WORKFLOWS, requisitionId: string): SimJob {
  const wf = WORKFLOWS[workflow];
  const job: SimJob = {
    id: newJobId(),
    workflow_id: wf.id,
    workflow_name: wf.name,
    requisition_id: requisitionId,
    status: "IN PROGRESS",
    running_node: null,
    executed_nodes: [],
  };
  db.jobs[job.id] = job;
  return job;
}

export function enterNode(job: SimJob, node: string) {
  if (job.running_node && job.running_node !== node && !job.executed_nodes.includes(job.running_node)) {
    job.executed_nodes.push(job.running_node);
  }
  job.running_node = node;
}

export function finishJob(job: SimJob, results: Record<string, unknown>) {
  if (job.running_node && !job.executed_nodes.includes(job.running_node)) job.executed_nodes.push(job.running_node);
  job.running_node = null;
  job.status = "COMPLETED";
  job.waiting = undefined;
  job.results = results;
}

/** Opus pauses the run at an Off-Platform node and POSTs the task to the app's webhook. */
export function pauseOffPlatform(
  db: Db,
  job: SimJob,
  node: string,
  taskType: TaskType,
  inputs: Record<string, unknown>,
) {
  enterNode(job, node);
  const token = randomUUID();
  const schema = OUTPUT_SCHEMAS[taskType];
  job.waiting = { token, node_id: node, task_type: taskType, expected_output_schema: schema };
  const payload: OffPlatformPayload = {
    execution_id: job.id,
    workflow_id: job.workflow_id,
    workflow_name: job.workflow_name,
    node_id: node,
    inputs: { ...inputs, task_type: taskType },
    callback: { url: `/api/opus-sim/callback/${job.id}`, token, token_header: "X-Opus-Callback-Token" },
    expected_output_schema: schema,
  };
  // Opus never resends: the app must store everything on first delivery.
  receiveOffPlatformTask(db, payload);
}

function isWrapped(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) && "value" in (v as object) && "type" in (v as object);
}

/** Opus' callback endpoint. Enforces the Off-Platform rules. */
export function receiveCallback(db: Db, executionId: string, token: string | null, body: CallbackBody): CallbackResponse {
  const job = db.jobs[executionId];
  if (!job) return { status: 404, body: { error: "no_such_execution" } };
  if (!job.waiting || !token || job.waiting.token !== token) {
    return { status: 401, body: { error: "token_invalid", detail: "Token already used, or the run is no longer waiting." } };
  }
  if (body.status === "failed") {
    job.status = "FAILED";
    job.waiting = undefined;
    return { status: 200, body: { ok: true } };
  }
  const declared = job.waiting.expected_output_schema;
  const out = body.output_data ?? {};
  const undeclared = Object.keys(out).filter((k) => !(k in declared));
  if (undeclared.length) {
    return { status: 422, body: { error: "undeclared_output_field", detail: `Not in expected_output_schema: ${undeclared.join(", ")}` } };
  }
  const wrapped = Object.keys(out).filter((k) => isWrapped(out[k]));
  if (wrapped.length) {
    return { status: 422, body: { error: "wrapped_value", detail: `Values must be bare, not {value, type}: ${wrapped.join(", ")}` } };
  }
  const waiting = job.waiting;
  job.waiting = undefined; // single-use token: spent from here on
  if (!job.executed_nodes.includes(waiting.node_id)) job.executed_nodes.push(waiting.node_id);
  job.running_node = null;
  onOffPlatformOutput(db, job, waiting.task_type, out);
  return { status: 200, body: { ok: true } };
}

export function getAudit(db: Db, jobId: string): JobAudit | null {
  const job = db.jobs[jobId];
  if (!job) return null;
  const wf = job.workflow_id === "wf-flow1b" ? WORKFLOWS.flow1b : WORKFLOWS.flow1;
  return {
    job_id: job.id,
    status: job.status,
    nb_nodes: wf.nodes,
    executed_nodes: job.executed_nodes,
    running_node: job.running_node,
    failed_nodes: job.status === "FAILED" && job.running_node ? [job.running_node] : [],
  };
}
