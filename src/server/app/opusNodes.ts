/**
 * Real Opus Off-Platform nodes the app handles (spec 02).
 * Opus doesn't say which node sent a webhook, so each node has its own webhook URL:
 *   POST /api/opus/webhook?node=<key>
 * Input and output IDs live here, so a Builder change only touches this file.
 */
import "server-only";
import type { EmploymentType, Requisition, RequisitionInput, Settings, TaskType } from "@/domain/types";
import { CREATE_REQUISITION_INPUTS, REQUISITION_ID_INPUT } from "./createRequisitionCase";

type Field =
  | "requisition_id"
  | "message"
  | "department"
  | "role"
  | "store"
  | "region"
  | "employment_type"
  | "openings"
  | "target_start"
  | "base_min"
  | "base_max"
  | "about"
  | "duties"
  | "requirements"
  | "benefits"
  | "shift_pattern";

/** Hiring Manager Review Round 1: input ID (Opus) → app field (spec 02 §6.4). */
export const HM_REVIEW_INPUTS: Record<string, Field> = {
  workflow_input_1a4neujk0: "requisition_id",
  workflow_input_5q6u44ygg: "message",
  workflow_input_sbv9ddudn: "department",
  workflow_input_88pemvv0j: "role",
  workflow_input_fzyzsdkbx: "store",
  workflow_input_jv3vprocq: "region",
  workflow_input_es2yy2kmf: "employment_type",
  workflow_input_p369otc5u: "openings",
  workflow_input_7teogziuu: "target_start",
  workflow_input_1m2e7eynj: "base_min",
  workflow_input_8hck6z17d: "base_max",
  workflow_input_tfsihzkom: "about",
  workflow_input_xnqhm8a5n: "duties",
  workflow_input_07a8645ub: "requirements",
  workflow_input_3v8672d4o: "benefits",
  workflow_input_qgtom58kp: "shift_pattern",
};

export interface OpusNode {
  task_type: TaskType;
  round: number;
  /** App stage key (same as the simulator's), used by the stepper and Settings node_map. */
  node_id: string;
  label: string;
  inputs: Record<string, Field>;
}

export const OPUS_NODES: Record<string, OpusNode> = {
  hm_review_r1: {
    task_type: "HM_JD_REVISE",
    round: 1,
    node_id: "n_hm_revise_r1",
    label: "Hiring Manager Review Round 1",
    inputs: HM_REVIEW_INPUTS,
  },
};

// ------------------------------------------------------------ parsers (Opus → app)

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[,\s]/g, "")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** "Full time" / "Full-time" / "full time" → "Full-time". */
export function parseEmploymentType(v: unknown): EmploymentType | undefined {
  const s = str(v)?.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (s === "full time") return "Full-time";
  if (s === "part time") return "Part-time";
  return undefined;
}

/** "DD/MM/YYYY", "DD-MM-YYYY" or "YYYY-MM-DD" → "YYYY-MM-DD". */
export function parseOpusDate(v: unknown): string | undefined {
  const s = str(v)?.trim() ?? "";
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

const lines = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** The requisition as a RequisitionInput: the fallback for any field Opus didn't send. */
export function requisitionToInput(r: Requisition): RequisitionInput {
  return {
    department: r.department,
    role: r.role,
    store_id: r.store_id,
    openings: r.openings,
    base_min: r.base_min,
    base_max: r.base_max,
    employment_type: r.employment_type,
    target_start: r.target_start,
    jd: {
      about: r.jd_sections.about,
      duties: r.jd_sections.duties,
      requirements: r.jd_sections.requirements,
      benefits: r.jd_sections.benefits,
      shift_pattern: r.jd_sections.shift_pattern ?? "",
    },
  };
}

export interface ReadInputs {
  requisition_id?: string;
  message: string;
  /** Raw values by app field, unwrapped from { type, value }. */
  values: Partial<Record<Field, unknown>>;
}

/** Unwraps the mapped inputs. Unmapped inputs (node name, round, anything new) are ignored. */
export function readInputs(node: OpusNode, inputs: Record<string, { value?: unknown }>): ReadInputs {
  const values: Partial<Record<Field, unknown>> = {};
  for (const [id, field] of Object.entries(node.inputs)) {
    if (id in inputs) values[field] = inputs[id]?.value;
  }
  const rid = str(values.requisition_id)?.trim();
  return { requisition_id: rid || undefined, message: str(values.message) ?? "", values };
}

export interface Prefill {
  prefill: RequisitionInput;
  /** Values Opus sent that don't match Settings; the form shows them and asks for a valid choice. */
  unmatched: { department?: string; role?: string; store?: string };
  /** Fields that were missing or unreadable and fell back to the requisition. */
  fallbacks: string[];
}

/** Builds the HM form's prefill from the webhook values, falling back to the requisition (spec 02 §6.4). */
export function buildPrefill(values: ReadInputs["values"], r: Requisition, s: Settings): Prefill {
  const base = requisitionToInput(r);
  const fallbacks: string[] = [];
  const unmatched: Prefill["unmatched"] = {};
  const pick = <T>(field: Field, parsed: T | undefined, fb: T): T => {
    if (parsed === undefined) {
      fallbacks.push(field);
      return fb;
    }
    return parsed;
  };
  const text = (field: Field) => str(values[field]);

  let department = pick("department", text("department")?.trim(), base.department);
  const dept = s.departments.find((d) => d.name.toLowerCase() === department.toLowerCase());
  if (dept) department = dept.name;
  else {
    unmatched.department = department;
    department = "";
  }
  let role = pick("role", text("role")?.trim(), base.role);
  const roleMatch = dept?.roles.find((x) => x.toLowerCase() === role.toLowerCase());
  if (roleMatch) role = roleMatch;
  else {
    unmatched.role = role;
    role = "";
  }
  const storeName = text("store")?.trim();
  let store_id = base.store_id;
  if (storeName === undefined) fallbacks.push("store");
  else {
    const st = s.stores.find((x) => x.name.toLowerCase() === storeName.toLowerCase() || x.id === storeName);
    if (st) store_id = st.id;
    else {
      unmatched.store = storeName;
      store_id = "";
    }
  }
  const about = text("about");
  const duties = text("duties");
  const requirements = text("requirements");
  const benefits = text("benefits");
  const shift = text("shift_pattern");
  const openings = num(values.openings);

  const prefill: RequisitionInput = {
    department,
    role,
    store_id,
    openings: pick("openings", openings === undefined ? undefined : Math.trunc(openings), base.openings),
    base_min: pick("base_min", num(values.base_min), base.base_min),
    base_max: pick("base_max", num(values.base_max), base.base_max),
    employment_type: pick("employment_type", parseEmploymentType(values.employment_type), base.employment_type),
    target_start: pick("target_start", parseOpusDate(values.target_start), base.target_start),
    jd: {
      about: pick("about", about?.trim(), base.jd.about),
      duties: pick("duties", duties === undefined ? undefined : lines(duties), base.jd.duties),
      requirements: pick("requirements", requirements === undefined ? undefined : lines(requirements), base.jd.requirements),
      benefits: pick("benefits", benefits?.trim(), base.jd.benefits),
      shift_pattern: pick("shift_pattern", shift?.trim(), base.jd.shift_pattern ?? ""),
    },
  };
  return { prefill, unmatched, fallbacks };
}

// ------------------------------------------------------------ output (app → Opus)

/**
 * The 14 outputs of the HM review node (spec 02 §7.1): the same IDs and formats as the
 * Create Requisition inputs (spec 01 §6), without the requisition ID. Bare values.
 */
export function buildHmReviewOutput(r: Requisition): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const i of CREATE_REQUISITION_INPUTS) {
    if (i.id === REQUISITION_ID_INPUT) continue;
    out[i.id] = i.value(r);
  }
  return out;
}
