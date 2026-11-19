/**
 * In-memory store (demo only). Lives on globalThis so every route handler bundle
 * and hot reload shares one instance. A real build replaces this with a small DB
 * (context §5.1: Azure SQL or Postgres).
 */
import "server-only";
import type { Candidate, Requisition, Settings, TaskRecord, TaskType } from "@/domain/types";
import { seedCandidates, seedRequisitions, seedSettings, seedTasks } from "@/domain/fixtures";

export interface SimJob {
  id: string;
  workflow_id: string;
  workflow_name: string;
  requisition_id: string;
  status: "IN PROGRESS" | "COMPLETED" | "FAILED";
  running_node: string | null;
  executed_nodes: string[];
  waiting?: {
    token: string;
    node_id: string;
    task_type: TaskType;
    expected_output_schema: Record<string, { type: string; required?: boolean }>;
  };
  results?: Record<string, unknown>;
}

export interface SimEvent {
  due: number;
  kind: "precheck" | "posting";
  reqId: string;
}

export interface Db {
  requisitions: Requisition[];
  candidates: Candidate[];
  tasks: TaskRecord[];
  settings: Settings;
  /** Opus side (simulator): job registry, as Opus would hold it. */
  jobs: Record<string, SimJob>;
  /** Simulated asynchronous Opus steps (AI pre-check, job posting). */
  events: SimEvent[];
  demo: { precheck_mode: "auto" | "pass" | "fail" };
  seq: { task: number };
}

function seedJobs(reqs: Requisition[], tasks: TaskRecord[]): Record<string, SimJob> {
  const jobs: Record<string, SimJob> = {};
  for (const r of reqs) {
    const f1 = r.opus_job_ids.flow1;
    if (f1) {
      const done = r.status === "Live" || r.status === "Rejected";
      jobs[f1] = {
        id: f1,
        workflow_id: "wf-flow1",
        workflow_name: "Flow 1 · Publish JD",
        requisition_id: r.id,
        status: done ? "COMPLETED" : "IN PROGRESS",
        running_node: done ? null : r.status === "AiPrecheck" ? `n_precheck_r${r.round}` : null,
        executed_nodes: [],
      };
    }
    const f1b = r.opus_job_ids.flow1b;
    if (f1b) {
      jobs[f1b] = {
        id: f1b,
        workflow_id: "wf-flow1b",
        workflow_name: "Flow 1b · Shortlist",
        requisition_id: r.id,
        status: "IN PROGRESS",
        running_node: null,
        executed_nodes: ["s_collect_scores", "s_band", "s_email_shortlisted", "s_email_regret", "s_start_2a"],
      };
    }
  }
  for (const t of tasks) {
    if (t.status !== "open") continue;
    const job = jobs[t.execution_id];
    if (!job) continue;
    job.running_node = t.node_id;
    job.waiting = {
      token: t.callback.token,
      node_id: t.node_id,
      task_type: t.task_type,
      expected_output_schema: t.expected_output_schema,
    };
  }
  return jobs;
}

export function seed(): Db {
  const requisitions = seedRequisitions();
  const candidates = seedCandidates(requisitions);
  const tasks = seedTasks(requisitions, candidates);
  return {
    requisitions,
    candidates,
    tasks,
    settings: seedSettings(),
    jobs: seedJobs(requisitions, tasks),
    events: [],
    demo: { precheck_mode: "auto" },
    seq: { task: tasks.length },
  };
}

const g = globalThis as unknown as { __valiramDb?: Db };

/** Raw access (no simulated-time processing). Use `db()` from service.ts in handlers. */
export function rawDb(): Db {
  if (!g.__valiramDb) g.__valiramDb = seed();
  return g.__valiramDb;
}

export function resetDb(): Db {
  g.__valiramDb = seed();
  return g.__valiramDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function simDelayMs(): number {
  const v = Number(process.env.SIM_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 2500;
}
