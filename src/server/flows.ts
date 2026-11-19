/**
 * Flow 1 (Publish JD) and Flow 1b (Shortlist) as the demo plays them (context §4).
 * Mixes two roles on purpose:
 *  - what the Opus workflow does (pre-check, decision routing, job posting, score bands), and
 *  - what the app records when it sees each step (status, timestamps, activity).
 * In the real build the first part runs in Opus and the app learns it from audit/results.
 */
import "server-only";
import type { Candidate, JdSections, Requisition, ReviewRound, TaskType, User } from "@/domain/types";
import { MAX_ROUNDS } from "@/domain/types";
import { bandOf, kitahqResults } from "@/domain/fixtures";
import type { Db, SimJob } from "./store";
import { nowIso, simDelayMs } from "./store";
import { runPrecheck as precheckRules } from "./precheck";
import { enterNode, finishJob, newJobId, pauseOffPlatform, startJob } from "./opus/simulator";

export const shortId = (jobId: string) => jobId.split("-").slice(0, 2).join("-");

function log(r: Requisition, text: string) {
  const t = nowIso();
  r.activity.push({ at: t, text });
  r.updated_at = t;
}

function mark(r: Requisition, stage: string) {
  r.stage_times[stage] = nowIso();
}

function schedule(db: Db, kind: "precheck" | "posting", reqId: string) {
  db.events = db.events.filter((e) => e.reqId !== reqId);
  db.events.push({ due: Date.now() + simDelayMs(), kind, reqId });
}

function job1(db: Db, r: Requisition): SimJob {
  return db.jobs[r.opus_job_ids.flow1!];
}

function currentReview(r: Requisition): ReviewRound {
  let rv = r.reviews.find((x) => x.round === r.round);
  if (!rv) {
    rv = { round: r.round, outcome: "pending" };
    r.reviews.push(rv);
  }
  return rv;
}

function userName(db: Db, id?: string) {
  return db.settings.users.find((u) => u.id === id)?.name ?? "HR";
}

function sameJd(a: JdSections, b: JdSections) {
  const n = (s?: string) => (s ?? "").trim();
  return (
    n(a.about) === n(b.about) &&
    a.duties.join("\n") === b.duties.join("\n") &&
    a.requirements.join("\n") === b.requirements.join("\n") &&
    n(a.benefits) === n(b.benefits) &&
    n(a.shift_pattern) === n(b.shift_pattern)
  );
}

// ------------------------------------------------------------------ Flow 1

/**
 * HM submits in the app: app creates the REQ (done by caller), starts Flow 1, stores the job ID.
 * `simulatePrecheck: false` (a real Opus case was created, spec 01): the requisition is saved at
 * AiPrecheck and stays there; its next status comes from the Opus Off-Platform webhook when the
 * workflow reaches a human review node, not from the simulator.
 */
export function submitRequisition(db: Db, r: Requisition, actor: User, opts: { simulatePrecheck?: boolean } = {}) {
  const t = nowIso();
  r.status = "Submitted";
  r.round = 1;
  mark(r, "Submitted");
  r.versions.push({ version: r.versions.length + 1, by: actor.name, by_role: "HM", at: t, change: r.copied_from ? `Submitted (copied from ${r.copied_from})` : "Submitted", sections: r.jd_sections });
  const job = startJob(db, "flow1", r.id);
  r.opus_job_ids.flow1 = job.id;
  log(r, `${actor.name} submitted the JD. App started Flow 1 (Jobs API) and saved job ID ${shortId(job.id)}.`);
  startPrecheck(db, r, opts.simulatePrecheck ?? true);
}

function startPrecheck(db: Db, r: Requisition, simulate = true) {
  r.status = "AiPrecheck";
  mark(r, "AiPrecheck");
  enterNode(job1(db, r), `n_precheck_r${r.round}`);
  if (simulate) schedule(db, "precheck", r.id);
}

export function runPrecheckStep(db: Db, r: Requisition) {
  if (r.status !== "AiPrecheck") return;
  db.events = db.events.filter((e) => e.reqId !== r.id);
  const findings = precheckRules(r.jd_sections, { store: r.store, region: r.region, role: r.role }, db.demo.precheck_mode);
  const pass = !findings.some((f) => f.result === "fail");
  const rv = currentReview(r);
  rv.precheck = { pass, at: nowIso(), findings };
  const job = job1(db, r);
  if (pass) {
    r.status = "WithHr";
    mark(r, "WithHr");
    const hrName = userName(db, r.hr_assignee ?? db.settings.users.find((u) => u.role === "HR_RECRUITER")?.id);
    log(r, `AI pre-check round ${r.round} passed. Opus paused at HR verification; task assigned to ${hrName}.`);
    pauseOffPlatform(db, job, `n_hr_verify_r${r.round}`, "HR_JD_CHECK", {
      round: r.round,
      requisition_id: r.id,
      jd_sections: r.jd_sections,
      findings,
    });
    return;
  }
  const n = findings.filter((f) => f.result === "fail").length;
  if (r.round >= MAX_ROUNDS) {
    rv.outcome = "rejected";
    log(r, `AI pre-check round ${r.round}: ${n} issue${n > 1 ? "s" : ""}. No rounds left.`);
    rejectRequisition(db, r);
    return;
  }
  rv.outcome = "returned";
  log(r, `AI pre-check round ${r.round}: ${n} issue${n > 1 ? "s" : ""}. Returned to hiring manager.`);
  returnToHm(db, r, findings.filter((f) => f.result !== "pass"), undefined, "AI pre-check");
}

function returnToHm(db: Db, r: Requisition, findings: unknown[], hrComments: string | undefined, returnedBy: string) {
  r.status = "ReturnedToHm";
  mark(r, "ReturnedToHm");
  pauseOffPlatform(db, job1(db, r), `n_hm_revise_r${r.round}`, "HM_JD_REVISE", {
    round: r.round,
    requisition_id: r.id,
    jd_sections: r.jd_sections,
    findings,
    hr_comments: hrComments ?? "",
    returned_by: returnedBy,
  });
}

function rejectRequisition(db: Db, r: Requisition) {
  const job = job1(db, r);
  enterNode(job, "n_reject");
  finishJob(job, { outcome: "rejected" });
  r.status = "Rejected";
  mark(r, "Rejected");
  r.completed_at = nowIso();
  log(r, `Not approved after round ${MAX_ROUNDS}; closed as Rejected. ${r.hm_name} and HR notified with all findings and comments.`);
}

export function runPostingStep(db: Db, r: Requisition) {
  if (r.status !== "JobPosting") return;
  db.events = db.events.filter((e) => e.reqId !== r.id);
  const job = job1(db, r);
  enterNode(job, "n_job_posting");
  const t = nowIso();
  r.posting = { generated_at: t, file_name: `job_post_${r.id}.pdf` };
  r.status = "Live";
  mark(r, "Live");
  r.screening = "open";
  log(r, "Job posting generated: LinkedIn-style post as PDF (demo). JD live.");
  enterNode(job, "n_notify");
  finishJob(job, { job_post_pdf: r.posting.file_name, status: "live" });
  r.completed_at = nowIso();
  log(r, "Flow 1 completed. Slack #recruitment notified.");
}

// ------------------------------------------------------------------ Flow 1b

export function startFlow1b(db: Db, r: Requisition) {
  // Restart support for the demo: close the previous review task and drop old candidates.
  if (r.opus_job_ids.flow1b) {
    const old = db.jobs[r.opus_job_ids.flow1b];
    if (old) old.waiting = undefined;
    for (const t of db.tasks) {
      if (t.execution_id === r.opus_job_ids.flow1b && t.status === "open") t.status = "closed";
    }
    db.candidates = db.candidates.filter((c) => c.requisition_id !== r.id);
  }
  const rules = db.settings.rules;
  const t = nowIso();
  const job = startJob(db, "flow1b", r.id);
  r.opus_job_ids.flow1b = job.id;
  r.screening = "closed";
  log(r, `KitaHQ screening closed. App started Flow 1b (Shortlist), job ${shortId(job.id)}.`);
  enterNode(job, "s_collect_scores");
  const base = db.candidates.length;
  const cands: Candidate[] = kitahqResults(r.id).map(([name, email, score, note, tags, rehire], i) => {
    const band = bandOf(score, rules);
    return {
      id: `C-${r.id.slice(-3)}-${String(base + i + 1).padStart(3, "0")}`,
      requisition_id: r.id,
      name,
      email,
      phone: `+60 1${(i % 9) + 1}-${String(2000000 + i * 104729).slice(0, 3)} ${String(1000 + i * 271).slice(0, 4)}`,
      kitahq_score: score,
      kitahq_note: note,
      band,
      shortlist_source: band === "hi" ? "auto" : undefined,
      status: band === "hi" ? "Shortlisted" : band === "mid" ? "AwaitingHrReview" : "RegretSent",
      status_at: t,
      tags,
      rehire: !!rehire,
      store: r.store,
      opus_job_ids: {},
      flow2a_started: false,
    };
  });
  enterNode(job, "s_band");
  // 90%+: shortlisted email + Flow 2a straight away (they don't wait for HR review).
  for (const c of cands.filter((c) => c.band === "hi")) {
    c.flow2a_started = true;
    c.opus_job_ids.flow2a = `2a-${newJobId().slice(0, 9)}`;
  }
  enterNode(job, "s_email_shortlisted");
  enterNode(job, "s_email_regret");
  db.candidates.push(...cands);
  const counts = {
    hi: cands.filter((c) => c.band === "hi").length,
    mid: cands.filter((c) => c.band === "mid").length,
    lo: cands.filter((c) => c.band === "lo").length,
  };
  r.shortlist = {
    job_id: job.id,
    status: counts.mid ? "WaitingHrReview" : "Complete",
    closed_at: t,
    scored_at: t,
    banded_at: t,
    emails_at: t,
    counts,
    flow2a_started: counts.hi > 0,
  };
  log(r, `KitaHQ screening closed: ${counts.hi} shortlisted (${rules.auto_min}%+), ${counts.mid} for HR review, ${counts.lo} regret emails sent.`);
  if (counts.mid) {
    const mid = cands.filter((c) => c.band === "mid");
    pauseOffPlatform(db, job, "s_hr_review", "SHORTLIST_REVIEW", {
      requisition_id: r.id,
      band: `${rules.review_min}-${rules.auto_min - 1}`,
      candidates: mid.map((c) => ({ id: c.id, name: c.name, score: c.kitahq_score, note: c.kitahq_note })),
    });
    const task = db.tasks[db.tasks.length - 1];
    r.shortlist.review_task_id = task.id;
    r.shortlist.review_by = task.assignee_name;
  } else {
    enterNode(job, "s_start_2a");
    finishJob(job, { shortlisted: counts.hi });
    log(r, "No candidates in the 70–89% band; HR review skipped.");
  }
}

// ------------------------------------------------------------------ Callback routing

/** Called by the simulator after it accepted a callback (200). */
export function onOffPlatformOutput(db: Db, job: SimJob, type: TaskType, out: Record<string, unknown>) {
  const r = db.requisitions.find((x) => x.id === job.requisition_id);
  if (!r) return;
  const task = db.tasks.find((t) => t.execution_id === job.id && t.status === "open" && t.task_type === type);
  const actor = task?.assignee_name ?? "User";
  const t = nowIso();

  if (type === "HR_JD_CHECK") {
    const rv = currentReview(r);
    const decision = out.decision === "approve" ? "approve" : "reject";
    const comments = typeof out.hr_comments === "string" ? out.hr_comments : "";
    const edited = out.edited_jd && typeof out.edited_jd === "object" ? normaliseJd(out.edited_jd as Partial<JdSections>, r.jd_sections) : null;
    const didEdit = !!edited && !sameJd(edited, r.jd_sections);
    rv.hr = { decision, by: actor, at: t, comments: comments || undefined, edited: didEdit };
    if (decision === "approve") {
      if (didEdit && edited) {
        r.jd_sections = edited;
        r.versions.push({ version: r.versions.length + 1, by: actor, by_role: "HR", at: t, change: "Inline edits during HR verification", sections: edited, published: true });
      } else if (r.versions.length) {
        r.versions[r.versions.length - 1].published = true;
      }
      rv.outcome = "approved";
      r.status = "JobPosting";
      mark(r, "JobPosting");
      log(r, `${actor} approved${didEdit ? " with edits" : ""}. App returned the decision to Opus; Flow 1 resumed.`);
      enterNode(job, "n_job_posting");
      schedule(db, "posting", r.id);
      return;
    }
    if (r.round >= MAX_ROUNDS) {
      rv.outcome = "rejected";
      log(r, `${actor} rejected the requisition in round ${r.round}: "${comments}"`);
      rejectRequisition(db, r);
      return;
    }
    rv.outcome = "returned";
    log(r, `Returned to ${r.hm_name} (round ${r.round}, HR comments).`);
    returnToHm(db, r, rv.precheck?.findings.filter((f) => f.result !== "pass") ?? [], comments, actor);
    return;
  }

  if (type === "HM_JD_REVISE") {
    const rv = currentReview(r);
    const revised = normaliseJd((out.revised_jd ?? {}) as Partial<JdSections>, r.jd_sections);
    const note = typeof out.hm_note === "string" ? out.hm_note : "";
    rv.hm = { by: actor, at: t, note: note || undefined };
    r.jd_sections = revised;
    r.versions.push({ version: r.versions.length + 1, by: actor, by_role: "HM", at: t, change: `Revised after round ${r.round}${note ? `: ${note}` : ""}`, sections: revised });
    r.round += 1;
    log(r, `${actor} resubmitted (v${r.versions.length}). Round ${r.round} of ${MAX_ROUNDS}.`);
    startPrecheck(db, r);
    return;
  }

  if (type === "SHORTLIST_REVIEW") {
    const ids = Array.isArray(out.selected_candidate_ids) ? (out.selected_candidate_ids as unknown[]).map(String) : [];
    const mid = db.candidates.filter((c) => c.requisition_id === r.id && c.band === "mid");
    let n = 0;
    for (const c of mid) {
      c.status_at = t;
      if (ids.includes(c.id)) {
        n += 1;
        c.status = "ShortlistedByHr";
        c.shortlist_source = "hr";
        c.flow2a_started = true;
        c.opus_job_ids.flow2a = `2a-${newJobId().slice(0, 9)}`;
      } else {
        c.status = "NotSelected";
      }
    }
    enterNode(job, "s_email_shortlisted");
    enterNode(job, "s_start_2a");
    finishJob(job, { selected_candidate_ids: ids });
    if (r.shortlist) {
      r.shortlist.status = "Complete";
      r.shortlist.review_done_at = t;
      r.shortlist.selected = n;
      r.shortlist.hr_note = typeof out.hr_note === "string" ? out.hr_note : undefined;
      r.shortlist.flow2a_started = r.shortlist.flow2a_started || n > 0;
    }
    log(r, `${actor} selected ${n} of ${mid.length} (70–89%): shortlisted email and Flow 2a for each; ${mid.length - n} regret emails.`);
  }
}

function normaliseJd(p: Partial<JdSections>, prev: JdSections): JdSections {
  const list = (v: unknown, fb: string[]) =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : fb;
  return {
    about: typeof p.about === "string" ? p.about : prev.about,
    duties: list(p.duties, prev.duties),
    requirements: list(p.requirements, prev.requirements),
    benefits: typeof p.benefits === "string" ? p.benefits : prev.benefits,
    shift_pattern: typeof p.shift_pattern === "string" ? p.shift_pattern : prev.shift_pattern,
    how_to_apply: prev.how_to_apply,
  };
}

// ------------------------------------------------------------------ simulated time

/** Run any simulated Opus steps that are due. Called at the start of every API request. */
export function tick(db: Db) {
  const now = Date.now();
  const due = db.events.filter((e) => e.due <= now).sort((a, b) => a.due - b.due);
  for (const e of due) {
    const r = db.requisitions.find((x) => x.id === e.reqId);
    if (!r) continue;
    if (e.kind === "precheck") runPrecheckStep(db, r);
    else runPostingStep(db, r);
  }
  db.events = db.events.filter((e) => e.due > now);
}
