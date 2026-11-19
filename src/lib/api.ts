/**
 * Typed API client. Every page uses only this module, so the backend behind /api
 * (mock simulator today, real Opus relay later via DATA_MODE) can change without UI changes.
 * Responses are validated with the zod schemas in src/domain/schemas.ts.
 */
import { z } from "zod";
import {
  CandidateSchema,
  DemoStateSchema,
  RequisitionSchema,
  SettingsSchema,
  TaskSchema,
  UserSchema,
} from "@/domain/schemas";
import type {
  Candidate,
  DemoState,
  Requisition,
  RequisitionInput,
  Settings,
  Task,
  User,
} from "@/domain/types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

async function call<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    credentials: "same-origin",
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json as { error?: string; message?: string; field?: string; issues?: { path: string }[] };
    throw new ApiClientError(res.status, e.error ?? "error", e.message ?? `Request failed (${res.status})`, e.field ?? e.issues?.[0]?.path);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error("API response did not match schema", path, parsed.error.issues);
    throw new ApiClientError(500, "bad_response", "Unexpected response from the server");
  }
  return parsed.data;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const CompleteResultSchema = z.object({ task: TaskSchema, requisition: RequisitionSchema });
const TaskDetailSchema = z.object({ task: TaskSchema, requisition: RequisitionSchema, candidates: z.array(CandidateSchema) });

export const api = {
  me: (): Promise<User> => call(UserSchema, "/api/me"),

  requisitions: {
    list: (q?: { status?: string; q?: string }): Promise<Requisition[]> => {
      const p = new URLSearchParams();
      if (q?.status) p.set("status", q.status);
      if (q?.q) p.set("q", q.q);
      return call(z.array(RequisitionSchema), `/api/requisitions${p.size ? `?${p}` : ""}`);
    },
    get: (id: string): Promise<Requisition> => call(RequisitionSchema, `/api/requisitions/${encodeURIComponent(id)}`),
    create: (input: RequisitionInput): Promise<Requisition> => call(RequisitionSchema, "/api/requisitions", post(input)),
    updateDraft: (id: string, input: RequisitionInput): Promise<Requisition> =>
      call(RequisitionSchema, `/api/requisitions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
    copy: (id: string): Promise<Requisition> => call(RequisitionSchema, `/api/requisitions/${encodeURIComponent(id)}/copy`, post()),
    candidates: (id: string): Promise<Candidate[]> =>
      call(z.array(CandidateSchema), `/api/requisitions/${encodeURIComponent(id)}/candidates`),
    postingPdfUrl: (id: string, download = false) =>
      `/api/requisitions/${encodeURIComponent(id)}/posting.pdf${download ? "?download=1" : ""}`,
  },

  tasks: {
    list: (status: "open" | "done" | "all" = "all"): Promise<Task[]> => call(z.array(TaskSchema), `/api/tasks?status=${status}`),
    get: (id: string): Promise<{ task: Task; requisition: Requisition; candidates: Candidate[] }> =>
      call(TaskDetailSchema, `/api/tasks/${encodeURIComponent(id)}`),
    /** Sends output_data (bare values). Throws ApiClientError 401 when the task is closed in Opus. */
    complete: (id: string, output_data: Record<string, unknown>): Promise<{ task: Task; requisition: Requisition }> =>
      call(CompleteResultSchema, `/api/tasks/${encodeURIComponent(id)}/complete`, post({ output_data })),
  },

  settings: {
    get: (): Promise<Settings> => call(SettingsSchema, "/api/settings"),
    update: (patch: Partial<Pick<Settings, "stores" | "rules" | "node_map" | "departments">> & { how_to_apply?: string }): Promise<Settings> =>
      call(SettingsSchema, "/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  },

  demo: {
    state: (): Promise<DemoState> => call(DemoStateSchema, "/api/demo/state"),
    reset: (): Promise<DemoState> => call(DemoStateSchema, "/api/demo/reset", post()),
    setPrecheck: (mode: "auto" | "pass" | "fail"): Promise<DemoState> => call(DemoStateSchema, "/api/demo/precheck", post({ mode })),
    closeScreening: (requisitionId: string): Promise<Requisition> => call(RequisitionSchema, "/api/demo/close-screening", post({ requisitionId })),
    advance: (requisitionId: string): Promise<Requisition> => call(RequisitionSchema, "/api/demo/advance", post({ requisitionId })),
  },
};
