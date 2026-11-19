/**
 * App side: Off-Platform webhook receiver logic.
 * In the demo the simulator calls this directly. In the real build,
 * src/app/api/opus/webhook/route.ts verifies the shared header, then calls this,
 * and must answer 200 within 15 s (Opus never resends).
 */
import "server-only";
import type { TaskRecord } from "@/domain/types";
import type { Db } from "../store";
import { nowIso } from "../store";
import type { OffPlatformPayload, OpusOffPlatformPayload } from "../opus/types";
import { ApiError } from "../service";
import { opusReturnToHm } from "../flows";
import { OPUS_NODES, buildPrefill, readInputs } from "./opusNodes";

export function receiveOffPlatformTask(db: Db, p: OffPlatformPayload): TaskRecord {
  const req = db.requisitions.find(
    (r) => r.opus_job_ids.flow1 === p.execution_id || r.opus_job_ids.flow1b === p.execution_id,
  );
  if (!req) throw new Error(`No requisition for execution ${p.execution_id}`);
  const users = db.settings.users;
  const hr = users.find((u) => u.id === req.hr_assignee) ?? users.find((u) => u.role === "HR_RECRUITER")!;
  const hm = users.find((u) => u.id === req.hm_user)!;
  const type = p.inputs.task_type;
  const assignee = type === "HM_JD_REVISE" ? hm : hr;
  if (type !== "HM_JD_REVISE" && !req.hr_assignee) {
    req.hr_assignee = hr.id;
    req.hr_name = hr.name;
  }
  const title =
    type === "HR_JD_CHECK"
      ? `Verify JD · ${req.role}`
      : type === "HM_JD_REVISE"
        ? `Revise JD · ${req.role}`
        : "Select candidates · 70–89% band";
  db.seq.task += 1;
  const task: TaskRecord = {
    id: `T-${String(db.seq.task).padStart(4, "0")}`,
    task_type: type,
    execution_id: p.execution_id,
    workflow_id: p.workflow_id,
    workflow_name: p.workflow_name,
    node_id: p.node_id,
    requisition_id: req.id,
    title,
    round: typeof p.inputs.round === "number" ? p.inputs.round : undefined,
    assignee: assignee.id,
    assignee_name: assignee.name,
    status: "open",
    created_at: nowIso(),
    reminders: [],
    inputs: p.inputs,
    expected_output_schema: p.expected_output_schema,
    callback: p.callback, // token stays server-side
  };
  db.tasks.push(task);
  return task;
}

// ------------------------------------------------------------ real Opus (spec 02)

/**
 * Real Opus Off-Platform webhook for a known node (spec 02 §6.2 steps 6–9).
 * Stores execution_id and the full callback (Opus never resends them), creates the task and
 * moves the requisition on. Idempotent per execution_id + node.
 */
export function receiveOpusTask(db: Db, nodeKey: string, p: OpusOffPlatformPayload): { task: TaskRecord; created: boolean } {
  const node = OPUS_NODES[nodeKey];
  const read = readInputs(node, p.inputs);
  const tag = `[opus] webhook node=${nodeKey} execution_id=${p.execution_id}`;
  const req = read.requisition_id ? db.requisitions.find((r) => r.id === read.requisition_id) : undefined;
  if (!req || !db.opus_cases[req.id]) {
    console.error(`${tag} requisition_id=${read.requisition_id ?? "(missing)"}: no requisition with an Opus case. Rejected with 422.`);
    throw new ApiError(422, "unknown_requisition", "No requisition with an Opus case matches requisition_id.");
  }

  const existing = db.tasks.find((t) => t.execution_id === p.execution_id && t.node_id === node.node_id);
  if (existing) {
    console.info(`${tag} requisition_id=${req.id}: duplicate delivery, task ${existing.id} already exists.`);
    return { task: existing, created: false };
  }

  if (!p.callback.url.replace(/\/+$/, "").endsWith(`/callback/${p.execution_id}`)) {
    console.warn(`${tag} requisition_id=${req.id}: callback.url does not end with /callback/<execution_id>; using it as sent.`);
  }
  if (req.status !== "AiPrecheck" || req.round !== node.round) {
    console.warn(`${tag} requisition_id=${req.id}: requisition is ${req.status} round ${req.round}, expected AiPrecheck round ${node.round}. Creating the task anyway.`);
  }

  const { prefill, unmatched, fallbacks } = buildPrefill(read.values, req, db.settings);
  if (fallbacks.length) console.warn(`${tag} requisition_id=${req.id}: missing or unreadable inputs, prefilled from the requisition: ${fallbacks.join(", ")}`);

  const hm = db.settings.users.find((u) => u.id === req.hm_user)!;
  db.seq.task += 1;
  const task: TaskRecord = {
    id: `T-${String(db.seq.task).padStart(4, "0")}`,
    task_type: node.task_type,
    execution_id: p.execution_id,
    workflow_id: p.workflow_id,
    workflow_name: p.workflow_name,
    node_id: node.node_id,
    requisition_id: req.id,
    title: `Revise requisition · ${req.role}`,
    round: node.round,
    assignee: hm.id,
    assignee_name: hm.name,
    status: "open",
    created_at: nowIso(),
    reminders: [],
    inputs: {
      task_type: node.task_type,
      requisition_id: req.id,
      round: node.round,
      returned_by: "AI pre-check",
      message: read.message,
      prefill,
      unmatched,
    },
    expected_output_schema: p.expected_output_schema as TaskRecord["expected_output_schema"],
    callback: { url: p.callback.url, token: p.callback.token, token_header: p.callback.token_header }, // stays server-side
    source: "opus",
  };
  db.tasks.push(task);

  const rec = db.opus_cases[req.id];
  rec.execution_ids = [...(rec.execution_ids ?? []).filter((x) => x !== p.execution_id), p.execution_id];

  opusReturnToHm(req, node.round, read.message, task.id, hm.name, node.label);
  console.info(`${tag} requisition_id=${req.id}: task ${task.id} created for ${hm.name}.`);
  return { task, created: true };
}
