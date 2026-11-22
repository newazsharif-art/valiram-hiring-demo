/**
 * App backend service used by the route handlers (the "relay" in the context file).
 * Role scoping, validation and Off-Platform callback handling live here.
 */
import "server-only";
import type {
  Candidate,
  JdSections,
  Requisition,
  RequisitionInput,
  Settings,
  Task,
  TaskRecord,
  User,
} from "@/domain/types";
import { MAX_ROUNDS } from "@/domain/types";
import type { Db } from "./store";
import { nowIso, rawDb, resetDb, simDelayMs } from "./store";
import { runPostingStep, runPrecheckStep, startFlow1b, submitRequisition, tick } from "./flows";
import { dataMode, sendCallback } from "./app/callbackSender";
import { startCreateRequisitionCase } from "./app/createRequisitionCase";
import { buildHmReviewOutput, buildHrReviewOutput } from "./app/opusNodes";
import { opusHrDecided, opusResubmitted } from "./flows";
import { RequisitionInputSchema } from "@/domain/schemas";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Store access for handlers: processes due simulated Opus steps first. */
export function db(): Db {
  const d = rawDb();
  tick(d);
  return d;
}

export function userById(id: string | undefined): User {
  const users = rawDb().settings.users;
  return users.find((u) => u.id === id && u.switchable) ?? users.find((u) => u.id === "siti")!;
}

// ------------------------------------------------------------ requisitions

function visible(u: User, r: Requisition) {
  return u.role === "HIRING_MANAGER" ? r.hm_user === u.id : true;
}

export function listRequisitions(u: User, q?: { status?: string; q?: string }): Requisition[] {
  const d = db();
  const term = q?.q?.trim().toLowerCase();
  return d.requisitions
    .filter((r) => visible(u, r))
    .filter((r) => !q?.status || q.status === "all" || r.status === q.status)
    .filter((r) => !term || [r.id, r.store, r.hm_name, r.role, r.region, r.department].some((x) => x.toLowerCase().includes(term)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getRequisition(u: User, id: string): Requisition {
  const r = db().requisitions.find((x) => x.id === id);
  if (!r || !visible(u, r)) throw new ApiError(404, "not_found", `Requisition ${id} not found`);
  return r;
}

function nextReqId(d: Db): string {
  const now = new Date(Date.now() + 8 * 3600000); // MYT
  const prefix = `REQ-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const max = d.requisitions
    .filter((r) => r.id.startsWith(prefix))
    .map((r) => Number(r.id.slice(prefix.length)))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function applyInput(d: Db, r: Requisition, input: RequisitionInput) {
  const store = d.settings.stores.find((s) => s.id === input.store_id);
  const dept = d.settings.departments.find((x) => x.name === input.department);
  if (!dept) throw new ApiError(400, "invalid", "Unknown department", { field: "department" });
  if (!dept.roles.includes(input.role)) throw new ApiError(400, "invalid", "Role is not under the chosen department", { field: "role" });
  if (!store) throw new ApiError(400, "invalid", "Unknown store", { field: "store_id" });
  r.department = input.department;
  r.role = input.role;
  r.store_id = input.store_id;
  r.store = store.name;
  r.region = store.region;
  r.openings = input.openings;
  r.base_min = input.base_min;
  r.base_max = input.base_max;
  r.employment_type = input.employment_type;
  r.target_start = input.target_start;
  r.copied_from = input.copied_from;
  const sections: JdSections = {
    about: input.jd.about.trim(),
    duties: input.jd.duties.map((s) => s.trim()).filter(Boolean),
    requirements: input.jd.requirements.map((s) => s.trim()).filter(Boolean),
    benefits: input.jd.benefits.trim(),
    shift_pattern: input.jd.shift_pattern?.trim() ?? "",
    how_to_apply: d.settings.template.how_to_apply,
  };
  r.jd_sections = sections;
  r.template_version = d.settings.template.version;
  r.updated_at = nowIso();
}

/**
 * Submit (spec 01): start the real Opus case first, and only if it succeeds store the requisition,
 * start the simulated Flow 1 and save the case ID. On an Opus failure nothing is stored.
 */
async function submitWithOpusCase(d: Db, r: Requisition, u: User): Promise<Requisition> {
  const opusCase = await startCreateRequisitionCase(r, u);
  d.requisitions.push(r);
  // With a real Opus case the status stays AiPrecheck until the Opus Off-Platform webhook reports a
  // human review node; the simulated pre-check only runs when the integration is off.
  submitRequisition(d, r, u, { simulatePrecheck: !opusCase });
  if (opusCase) {
    d.opus_cases[r.id] = {
      requisition_id: r.id,
      flow: "create_requisition",
      workflow_id: opusCase.workflowId,
      case_id: opusCase.caseId,
      created_at: nowIso(),
    };
  }
  return r;
}

export async function createRequisition(u: User, input: RequisitionInput): Promise<Requisition> {
  if (u.role !== "HIRING_MANAGER") throw new ApiError(403, "forbidden", "Only hiring managers create requisitions");
  const d = db();
  // "Copy to new requisition": only from the HM's own requisition rejected after round 3.
  const src = input.copied_from ? getRequisition(u, input.copied_from) : undefined;
  if (src && (src.hm_user !== u.id || src.status !== "Rejected")) {
    throw new ApiError(400, "invalid", "Only your own rejected requisitions can be copied", { field: "copied_from" });
  }
  const t = nowIso();
  const r: Requisition = {
    id: nextReqId(d),
    department: "",
    role: "",
    store_id: "",
    store: "",
    region: "",
    openings: 1,
    base_min: 0,
    base_max: 0,
    employment_type: "Full-time",
    target_start: "",
    hm_user: u.id,
    hm_name: u.name,
    jd_sections: { about: "", duties: [], requirements: [], benefits: "", shift_pattern: "", how_to_apply: d.settings.template.how_to_apply },
    template_version: d.settings.template.version,
    status: "Submitted",
    round: 1,
    opus_job_ids: {},
    created_at: t,
    updated_at: t,
    stage_times: {},
    versions: [],
    reviews: [],
    activity: [],
    screening: "not_open",
  };
  applyInput(d, r, input);
  const saved = await submitWithOpusCase(d, r, u);
  if (src) src.activity.push({ at: nowIso(), text: `${u.name} copied this requisition to ${saved.id}.` });
  return saved;
}

export function getCandidates(u: User, reqId: string): Candidate[] {
  if (u.role === "HIRING_MANAGER") throw new ApiError(403, "forbidden", "Candidates are visible to HR");
  getRequisition(u, reqId);
  return db()
    .candidates.filter((c) => c.requisition_id === reqId)
    .sort((a, b) => b.kitahq_score - a.kitahq_score);
}

// ------------------------------------------------------------ tasks

export function toPublicTask(t: TaskRecord): Task {
  // Strip the callback (token stays server-side) and the server-only source flag.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { callback, source, ...rest } = t;
  return rest;
}

function canAct(u: User, t: TaskRecord) {
  if (t.assignee === u.id) return true;
  // Shared HR pool (TBC in the context file): any HR recruiter may pick up HR tasks.
  return u.role === "HR_RECRUITER" && t.task_type !== "HM_JD_REVISE";
}

export function listTasks(u: User, status?: string): Task[] {
  return db()
    .tasks.filter((t) => canAct(u, t))
    .filter((t) => !status || status === "all" || (status === "open" ? t.status === "open" : t.status !== "open"))
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))
    .map(toPublicTask);
}

export function getTask(u: User, id: string): { task: Task; requisition: Requisition; candidates: Candidate[] } {
  const d = db();
  const t = d.tasks.find((x) => x.id === id);
  if (!t || !canAct(u, t)) throw new ApiError(404, "not_found", `Task ${id} not found`);
  const requisition = d.requisitions.find((r) => r.id === t.requisition_id)!;
  const candidates =
    t.task_type === "SHORTLIST_REVIEW"
      ? d.candidates.filter((c) => c.requisition_id === requisition.id).sort((a, b) => b.kitahq_score - a.kitahq_score)
      : [];
  return { task: toPublicTask(t), requisition, candidates };
}

function validateOutput(t: TaskRecord, r: Requisition, out: Record<string, unknown>) {
  if (t.task_type === "HR_JD_CHECK") {
    if (out.decision !== "approve" && out.decision !== "reject") throw new ApiError(400, "invalid", "Choose a decision", { field: "decision" });
    if (out.decision === "reject" && !(typeof out.hr_comments === "string" && out.hr_comments.trim())) {
      throw new ApiError(400, "comment_required", r.round >= MAX_ROUNDS ? "Add a comment explaining why the requisition is rejected." : "Add a comment so the hiring manager knows what to change.", { field: "hr_comments" });
    }
  }
  if (t.task_type === "HM_JD_REVISE") {
    const jd = out.revised_jd as Partial<JdSections> | undefined;
    if (!jd || typeof jd !== "object") throw new ApiError(400, "invalid", "revised_jd is required", { field: "revised_jd" });
    const duties = Array.isArray(jd.duties) ? jd.duties.filter((x) => String(x).trim()) : [];
    if (duties.length < 3) throw new ApiError(400, "invalid", "What you will do needs at least 3 points", { field: "duties" });
  }
  if (t.task_type === "SHORTLIST_REVIEW" && !Array.isArray(out.selected_candidate_ids)) {
    throw new ApiError(400, "invalid", "selected_candidate_ids must be a list", { field: "selected_candidate_ids" });
  }
}

/**
 * Complete a task = send the Off-Platform callback.
 * 401 from Opus (token spent / run not waiting) -> "task closed".
 * 422 (undeclared field) -> nothing stored, run stays paused, task stays open.
 */
export async function completeTask(u: User, id: string, output: Record<string, unknown>) {
  const d = db();
  const t = d.tasks.find((x) => x.id === id);
  if (!t || !canAct(u, t)) throw new ApiError(404, "not_found", `Task ${id} not found`);
  const r = d.requisitions.find((x) => x.id === t.requisition_id)!;
  if (t.source === "opus") return completeOpusTask(d, t, r, output);
  if (t.status === "open") validateOutput(t, r, output);
  const roundAtDecision = r.round;
  const res = await sendCallback(d, t, { status: "success", output_data: output });
  if (res.status === 401) {
    if (t.status === "open") t.status = "closed";
    throw new ApiError(401, "task_closed", "This step is already closed in Opus. Another user completed it, or the Opus job was cancelled. Nothing was sent.");
  }
  if (res.status === 404) throw new ApiError(404, "no_such_execution", "Opus has no such execution.");
  if (res.status === 422) throw new ApiError(422, res.body.error ?? "unprocessable", res.body.detail ?? "Opus rejected the output.");
  t.status = "done";
  t.completed_at = nowIso();
  if (t.task_type === "HR_JD_CHECK") {
    t.outcome = String(output.decision);
    const edited = !!r.reviews.find((x) => x.round === roundAtDecision)?.hr?.edited;
    t.outcome_label = output.decision === "approve" ? (edited ? "Approved with edits" : "Approved") : roundAtDecision >= MAX_ROUNDS ? "Rejected" : "Returned";
    t.title = output.decision === "approve" ? `Verified JD · ${edited ? "approved with edits" : "approved"}` : roundAtDecision >= MAX_ROUNDS ? "Verified JD · rejected" : "Verified JD · returned to HM";
  } else if (t.task_type === "HM_JD_REVISE") {
    t.outcome = "resubmitted";
    t.outcome_label = `Round ${roundAtDecision}`;
    t.title = "Revised JD · resubmitted";
  } else {
    const n = (output.selected_candidate_ids as unknown[]).length;
    t.outcome = "selected";
    t.outcome_label = `${n} selected`;
    t.title = "Selected candidates · 70–89% band";
  }
  return { task: toPublicTask(t), requisition: r };
}

const FIELD_LABELS: [keyof Requisition, string][] = [
  ["department", "Department"],
  ["role", "Role"],
  ["store", "Store"],
  ["employment_type", "Employment type"],
  ["openings", "Openings"],
  ["target_start", "Target start date"],
  ["base_min", "Base salary from"],
  ["base_max", "Base salary to"],
];

/**
 * Completes a task that came from the real Opus webhook. Only on 200 does the requisition change.
 * - HM review (spec 02 §7). Body: { requisition, hm_note? }. 14 bare outputs; requisition → With HR.
 * - HR final check (spec 03 §7). Body: { requisition, decision: "approve" | "return", hr_comments? }.
 *   Reviewed JSON + pass flag + message; Approve → Live, Return → Returned to HM next round.
 */
async function completeOpusTask(d: Db, t: TaskRecord, r: Requisition, body: Record<string, unknown>) {
  if (t.task_type !== "HM_JD_REVISE" && t.task_type !== "HR_JD_CHECK") throw new ApiError(400, "unsupported", "This Opus task type is not supported yet.");
  if (t.status === "closed") throw new ApiError(401, "task_closed", "This step is already closed in Opus. Another user completed it, or the Opus job was cancelled. Nothing was sent.");
  if (t.status === "done") throw new ApiError(409, "already_done", "This task was already submitted.");
  const isHr = t.task_type === "HR_JD_CHECK";
  // HR final check (spec 03 §7.3): decision first, then the comment, then the fields.
  const decision = body.decision;
  const comments = typeof body.hr_comments === "string" ? body.hr_comments.trim() : "";
  if (isHr) {
    if (decision !== "approve" && decision !== "return") throw new ApiError(400, "invalid", "Choose a decision", { field: "decision" });
    if (decision === "return" && !comments) throw new ApiError(400, "comment_required", "Add a comment so the hiring manager knows what to change.", { field: "hr_comments" });
  }
  const input = RequisitionInputSchema.parse(body.requisition);
  const note = typeof body.hm_note === "string" ? body.hm_note.trim() : "";

  // Build the requisition as it will be saved, without touching the stored one yet.
  const next: Requisition = structuredClone(r);
  applyInput(d, next, { ...input, copied_from: r.copied_from });
  const output_data: Record<string, unknown> = isHr
    ? buildHrReviewOutput((t.inputs.source_json as Record<string, unknown> | undefined) ?? {}, next, decision === "approve", comments)
    : buildHmReviewOutput(next);

  const declared = Object.keys(t.expected_output_schema ?? {});
  const undeclared = Object.keys(output_data).filter((k) => !declared.includes(k));
  if (declared.length && undeclared.length) {
    console.error(`[opus] callback task=${t.id} execution_id=${t.execution_id}: outputs not declared by the node: ${undeclared.join(", ")} | declared: ${declared.join(", ")}`);
    throw new ApiError(500, "opus_schema_mismatch", "The Opus step doesn't accept these fields, so nothing was sent. Please contact your system administrator.");
  }

  const res = await sendCallback(d, t, { status: "success", output_data });
  if (res.status === 401) {
    t.status = "closed";
    throw new ApiError(401, "task_closed", "This step is already closed in Opus. Another user completed it, or the Opus job was cancelled. Nothing was sent.");
  }
  if (res.status === 404) throw new ApiError(404, "no_such_execution", "Opus has no such execution.");
  if (res.status === 422) throw new ApiError(422, res.body.error ?? "unprocessable", res.body.detail ?? "Opus rejected the output.");

  const changed = FIELD_LABELS.filter(([k]) => r[k] !== next[k]).map(([, label]) => label);
  const roundAtDecision = r.round;
  if (isHr) {
    const approve = decision === "approve";
    opusHrDecided(r, next, t.assignee_name, approve, comments, changed);
    const edited = !!r.reviews.find((x) => x.round === roundAtDecision)?.hr?.edited;
    t.status = "done";
    t.completed_at = nowIso();
    t.outcome = approve ? "approve" : "return";
    t.outcome_label = approve ? (edited ? "Approved with edits" : "Approved") : "Returned";
    t.title = approve ? "Reviewed requisition · approved" : "Reviewed requisition · returned to HM";
    return { task: toPublicTask(t), requisition: r };
  }
  opusResubmitted(r, next, t.assignee_name, note, changed);
  t.status = "done";
  t.completed_at = nowIso();
  t.outcome = "resubmitted";
  t.outcome_label = `Round ${roundAtDecision}`;
  t.title = "Revised requisition · resubmitted";
  return { task: toPublicTask(t), requisition: r };
}

// ------------------------------------------------------------ settings

export function getSettings(): Settings {
  return db().settings;
}

export function updateSettings(u: User, patch: Partial<Pick<Settings, "stores" | "rules" | "node_map" | "departments">> & { how_to_apply?: string }): Settings {
  if (u.role !== "HR_ADMIN") throw new ApiError(403, "forbidden", "Only HR admin can change settings");
  const s = db().settings;
  if (patch.rules) {
    if (!(patch.rules.auto_min > patch.rules.review_min && patch.rules.review_min > 0 && patch.rules.auto_min <= 100)) {
      throw new ApiError(400, "invalid", "Thresholds must satisfy 0 < review_min < auto_min ≤ 100");
    }
    s.rules = patch.rules;
  }
  if (patch.stores) s.stores = patch.stores;
  if (patch.departments) s.departments = patch.departments;
  if (patch.node_map) s.node_map = patch.node_map;
  if (typeof patch.how_to_apply === "string" && patch.how_to_apply.trim()) s.template.how_to_apply = patch.how_to_apply.trim();
  return s;
}

// ------------------------------------------------------------ demo panel

export function demoState() {
  const d = db();
  return { precheck_mode: d.demo.precheck_mode, sim_delay_ms: simDelayMs(), data_mode: dataMode(), pending_events: d.events.length };
}

export function demoReset() {
  resetDb();
  return demoState();
}

export function demoSetPrecheck(mode: "auto" | "pass" | "fail") {
  db().demo.precheck_mode = mode;
  return demoState();
}

export function demoCloseScreening(reqId: string) {
  const d = db();
  const r = d.requisitions.find((x) => x.id === reqId);
  if (!r) throw new ApiError(404, "not_found", `Requisition ${reqId} not found`);
  if (r.status !== "Live") throw new ApiError(409, "not_live", "Screening can only close for a requisition whose JD is live");
  startFlow1b(d, r);
  return r;
}

/** Skip the simulated wait: run a pending AI pre-check or job posting now. */
export function demoAdvance(reqId: string) {
  const d = db();
  const r = d.requisitions.find((x) => x.id === reqId);
  if (!r) throw new ApiError(404, "not_found", `Requisition ${reqId} not found`);
  if (d.opus_cases[r.id] && (r.status === "AiPrecheck" || r.status === "ReturnedToHm" || r.status === "WithHr")) {
    throw new ApiError(
      409,
      "opus_driven",
      "This requisition runs on the real Opus workflow. Its status changes when Opus reaches a review step, not from the simulator.",
    );
  }
  if (r.status === "AiPrecheck") runPrecheckStep(d, r);
  else if (r.status === "JobPosting") runPostingStep(d, r);
  else throw new ApiError(409, "nothing_pending", "No simulated step is pending for this requisition");
  return r;
}
