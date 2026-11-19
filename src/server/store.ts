/**
 * In-memory store (demo only). Lives on globalThis so every route handler bundle
 * and hot reload shares one instance. A real build replaces this with a small DB
 * (context §5.1: Azure SQL or Postgres).
 */
import "server-only";
import { Redis } from "@upstash/redis";
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

/** A real Opus case started by the app (spec 01). Server-only: never returned to the browser. */
export interface OpusCaseRecord {
  requisition_id: string;
  flow: "create_requisition";
  workflow_id: string;
  case_id: string;
  /** ISO UTC; display in MYT. */
  created_at: string;
  /** Opus execution IDs seen on Off-Platform webhooks for this case (spec 02). Not the case ID. */
  execution_ids?: string[];
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
  /** Real Opus cases started by the app, keyed by requisition ID. */
  opus_cases: Record<string, OpusCaseRecord>;
  /** Last incoming Opus webhook requests, newest first, secrets masked (debugging; spec 02). */
  opus_webhook_log?: OpusWebhookLogEntry[];
}

export interface OpusWebhookLogEntry {
  /** ISO UTC; display in MYT. */
  at: string;
  /** Path and query, with secret and bypass values masked. */
  url: string;
  /** Request headers, with secret-bearing values masked. */
  headers: Record<string, string>;
  /** Parsed JSON body with callback.token masked, or the raw text (truncated) if it isn't JSON. */
  body: unknown;
  status: number;
  result: string;
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
    opus_cases: {},
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

// ------------------------------------------------------------ optional persistence (Vercel)

/**
 * On serverless hosting (Vercel) instances don't share memory and reset on cold start, so the
 * whole Db is kept as one JSON value in Upstash Redis when its REST env vars are set.
 * Without them (local dev) the store stays purely in memory.
 */
const DB_KEY = "valiram:db";
let client: Redis | null | undefined;

function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Run one request against the store. With Redis: load the Db, run `fn`, save it back if it changed.
 * Requests are serialised per instance so concurrent ones don't swap the global Db under each other.
 * Across instances it is last-write-wins, which is fine for a presenter-driven demo.
 */
export function withStore<T>(fn: () => T | Promise<T>): Promise<T> {
  const r = redis();
  if (!r) return Promise.resolve().then(fn);
  const run = async () => {
    g.__valiramDb = (await r.get<Db>(DB_KEY)) ?? seed();
    g.__valiramDb.opus_cases ??= {}; // Db saved before spec 01
    const before = JSON.stringify(g.__valiramDb);
    try {
      return await fn();
    } finally {
      const after = JSON.stringify(g.__valiramDb);
      if (after !== before) await r.set(DB_KEY, after);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function simDelayMs(): number {
  const v = Number(process.env.SIM_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 2500;
}
