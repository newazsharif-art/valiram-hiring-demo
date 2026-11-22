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
import { opusHmReceived, opusHrReceived, opusReturnToHm } from "../flows";
import { InvalidJsonInput, OPUS_NODES, buildPrefill, readInputs, type ReadInputs } from "./opusNodes";

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
  const tag = `[opus] webhook node=${nodeKey} execution_id=${p.execution_id}`;
  let read: ReadInputs;
  try {
    read = readInputs(node, p.inputs);
  } catch (e) {
    if (!(e instanceof InvalidJsonInput)) throw e;
    console.error(`${tag}: input ${e.inputId} is missing or not a JSON object. Rejected with 422.`);
    throw new ApiError(422, "invalid_json_input", `Input ${e.inputId} must be a JSON object.`);
  }
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
  // Expected status per node (spec 02 §6.2, spec 03 §6.1, spec 04 §6.1 step 8).
  const expected = node.task_type === "HR_JD_CHECK" ? ["WithHr", "AiPrecheck"] : node.round === 1 ? ["AiPrecheck"] : ["ReturnedToHm"];
  if (!expected.includes(req.status) || req.round !== node.round) {
    console.warn(`${tag} requisition_id=${req.id}: requisition is ${req.status} round ${req.round}, expected ${expected.join(" or ")} round ${node.round}. Creating the task anyway.`);
  }

  const { prefill, unmatched, fallbacks } = buildPrefill(read.values, req, db.settings);
  const fromHr = node.task_type === "HM_JD_REVISE" && node.round > 1; // HM review after HR returned it (spec 04)
  if (fromHr && !read.message.trim()) console.warn(`${tag} requisition_id=${req.id}: HR Response Message is empty.`);
  if (fallbacks.length) console.warn(`${tag} requisition_id=${req.id}: missing or unreadable inputs, prefilled from the requisition: ${fallbacks.join(", ")}`);

  const isHr = node.task_type === "HR_JD_CHECK";
  const users = db.settings.users;
  const assignee = isHr
    ? (users.find((u) => u.id === req.hr_assignee) ?? users.find((u) => u.role === "HR_RECRUITER")!)
    : users.find((u) => u.id === req.hm_user)!;
  if (isHr && !req.hr_assignee) {
    req.hr_assignee = assignee.id;
    req.hr_name = assignee.name;
  }
  db.seq.task += 1;
  const task: TaskRecord = {
    id: `T-${String(db.seq.task).padStart(4, "0")}`,
    task_type: node.task_type,
    execution_id: p.execution_id,
    workflow_id: p.workflow_id,
    workflow_name: p.workflow_name,
    node_id: node.node_id,
    requisition_id: req.id,
    title: `${isHr ? "Review" : "Revise"} requisition · ${req.role}`,
    round: node.round,
    assignee: assignee.id,
    assignee_name: assignee.name,
    status: "open",
    created_at: nowIso(),
    reminders: [],
    inputs: isHr
      ? { task_type: node.task_type, requisition_id: req.id, round: node.round, prefill, unmatched, source_json: read.json ?? {} }
      : {
          task_type: node.task_type,
          requisition_id: req.id,
          round: node.round,
          returned_by: fromHr ? (req.hr_name ?? "HR") : "AI pre-check",
          message: read.message,
          prefill,
          unmatched,
          ...(read.json ? { source_json: read.json } : {}),
        },
    expected_output_schema: p.expected_output_schema as TaskRecord["expected_output_schema"],
    callback: { url: p.callback.url, token: p.callback.token, token_header: p.callback.token_header }, // stays server-side
    source: "opus",
  };
  db.tasks.push(task);

  const rec = db.opus_cases[req.id];
  rec.execution_ids = [...(rec.execution_ids ?? []).filter((x) => x !== p.execution_id), p.execution_id];

  if (isHr) opusHrReceived(req, node.round, task.id, assignee.name, node.label);
  else if (fromHr) opusHmReceived(req, node.round, read.message, task.id, assignee.name, node.label);
  else opusReturnToHm(req, node.round, read.message, task.id, assignee.name, node.label);
  console.info(`${tag} requisition_id=${req.id}: task ${task.id} created for ${assignee.name}.`);
  return { task, created: true };
}
