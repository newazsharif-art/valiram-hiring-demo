/**
 * Domain model (context file §5.4) as zod schemas.
 * TypeScript types are inferred from these, and the typed API client
 * (src/lib/api.ts) validates responses with them.
 */
import { z } from "zod";

export const RoleSchema = z.enum(["HR_RECRUITER", "HIRING_MANAGER", "HR_ADMIN"]);

export const RequisitionStatusSchema = z.enum([
  "Submitted",
  "AiPrecheck",
  "WithHr",
  "ReturnedToHm",
  "JobPosting",
  "Live",
  "Rejected",
]);

export const EmploymentTypeSchema = z.enum(["Full-time", "Part-time"]);

export const JdSectionsSchema = z.object({
  about: z.string(),
  duties: z.array(z.string()),
  requirements: z.array(z.string()),
  benefits: z.string(),
  shift_pattern: z.string().optional(),
  how_to_apply: z.string(),
});

export const FindingSchema = z.object({
  code: z.string(),
  result: z.enum(["pass", "fail", "advisory"]),
  title: z.string(),
  detail: z.string().optional(),
});

export const ReviewRoundSchema = z.object({
  round: z.number(),
  precheck: z
    .object({ pass: z.boolean(), at: z.string(), findings: z.array(FindingSchema) })
    .optional(),
  hr: z
    .object({
      decision: z.enum(["approve", "reject"]),
      by: z.string(),
      at: z.string(),
      comments: z.string().optional(),
      edited: z.boolean(),
    })
    .optional(),
  hm: z.object({ by: z.string(), at: z.string(), note: z.string().optional() }).optional(),
  outcome: z.enum(["pending", "returned", "approved", "rejected"]),
});

export const JdVersionSchema = z.object({
  version: z.number(),
  by: z.string(),
  by_role: z.enum(["HM", "HR"]),
  at: z.string(),
  change: z.string(),
  sections: JdSectionsSchema,
  published: z.boolean().optional(),
});

export const ActivitySchema = z.object({ at: z.string(), text: z.string() });

export const ShortlistStateSchema = z.object({
  job_id: z.string(),
  status: z.enum(["WaitingHrReview", "Complete"]),
  closed_at: z.string(),
  scored_at: z.string(),
  banded_at: z.string(),
  emails_at: z.string(),
  counts: z.object({ hi: z.number(), mid: z.number(), lo: z.number() }),
  review_task_id: z.string().optional(),
  review_by: z.string().optional(),
  review_done_at: z.string().optional(),
  selected: z.number().optional(),
  hr_note: z.string().optional(),
  flow2a_started: z.boolean(),
});

export const RequisitionSchema = z.object({
  id: z.string(),
  department: z.string(),
  role: z.string(),
  store_id: z.string(),
  store: z.string(),
  region: z.string(),
  openings: z.number(),
  base_min: z.number(),
  base_max: z.number(),
  employment_type: EmploymentTypeSchema,
  target_start: z.string(),
  hm_user: z.string(),
  hm_name: z.string(),
  hr_assignee: z.string().optional(),
  hr_name: z.string().optional(),
  jd_sections: JdSectionsSchema,
  template_version: z.string(),
  status: RequisitionStatusSchema,
  round: z.number(),
  opus_job_ids: z.object({ flow1: z.string().optional(), flow1b: z.string().optional() }),
  posting: z.object({ generated_at: z.string(), file_name: z.string() }).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().optional(),
  stage_times: z.record(z.string()),
  versions: z.array(JdVersionSchema),
  reviews: z.array(ReviewRoundSchema),
  activity: z.array(ActivitySchema),
  copied_from: z.string().optional(),
  screening: z.enum(["not_open", "open", "closed"]),
  shortlist: ShortlistStateSchema.optional(),
});

export const BandSchema = z.enum(["hi", "mid", "lo"]);

export const CandidateStatusSchema = z.enum([
  "AwaitingHrReview",
  "Shortlisted",
  "ShortlistedByHr",
  "NotSelected",
  "RegretSent",
]);

export const CandidateSchema = z.object({
  id: z.string(),
  requisition_id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  kitahq_score: z.number(),
  kitahq_note: z.string(),
  band: BandSchema,
  shortlist_source: z.enum(["auto", "hr"]).optional(),
  status: CandidateStatusSchema,
  status_at: z.string(),
  tags: z.array(z.string()),
  rehire: z.boolean(),
  store: z.string(),
  opus_job_ids: z.object({ flow2a: z.string().optional(), flow2b: z.string().optional() }),
  flow2a_started: z.boolean(),
});

export const TaskTypeSchema = z.enum(["HR_JD_CHECK", "HM_JD_REVISE", "SHORTLIST_REVIEW"]);

export const OutputFieldSchema = z.object({ type: z.string(), required: z.boolean().optional() });

/** Task as the browser sees it. The callback token never leaves the server. */
export const TaskSchema = z.object({
  id: z.string(),
  task_type: TaskTypeSchema,
  execution_id: z.string(),
  workflow_id: z.string(),
  workflow_name: z.string(),
  node_id: z.string(),
  requisition_id: z.string(),
  title: z.string(),
  round: z.number().optional(),
  assignee: z.string(),
  assignee_name: z.string(),
  status: z.enum(["open", "done", "closed"]),
  created_at: z.string(),
  completed_at: z.string().optional(),
  outcome: z.string().optional(),
  outcome_label: z.string().optional(),
  reminders: z.array(z.string()),
  inputs: z.record(z.unknown()),
  expected_output_schema: z.record(OutputFieldSchema),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  role: RoleSchema,
  title: z.string(),
  tasks: z.string(),
  scope: z.string(),
  switchable: z.boolean(),
});

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  template: z.string(),
  active: z.boolean(),
});

export const StoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  manager: z.string(),
  active: z.boolean(),
});

export const TemplateSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  shown_as: z.string(),
  required: z.boolean(),
  rule: z.string(),
});

export const ShortlistRulesSchema = z.object({
  auto_min: z.number(),
  review_min: z.number(),
  shortlisted_email: z.string(),
  regret_email: z.string(),
});

export const ConnectionSchema = z.object({
  name: z.string(),
  used_for: z.string(),
  status: z.enum(["ok", "warn", "mock"]),
  status_text: z.string(),
  note: z.string().optional(),
});

export const NodeMapSchema = z.object({
  node: z.string(),
  type: z.string(),
  stage: z.string(),
  round: z.string(),
  tbc: z.string().optional(),
});

export const SettingsSchema = z.object({
  departments: z.array(DepartmentSchema),
  stores: z.array(StoreSchema),
  template: z.object({
    version: z.string(),
    sections: z.array(TemplateSectionSchema),
    how_to_apply: z.string(),
  }),
  rules: ShortlistRulesSchema,
  users: z.array(UserSchema),
  connections: z.array(ConnectionSchema),
  node_map: z.array(NodeMapSchema),
});

export const DemoStateSchema = z.object({
  precheck_mode: z.enum(["auto", "pass", "fail"]),
  sim_delay_ms: z.number(),
  data_mode: z.string(),
  pending_events: z.number(),
});

// ---- Request payloads (shared by the form and the route handlers) ----

export const JdInputSchema = z.object({
  about: z.string(),
  duties: z.array(z.string()),
  requirements: z.array(z.string()),
  benefits: z.string(),
  shift_pattern: z.string().optional(),
});

export const RequisitionInputSchema = z
  .object({
    department: z.string(),
    role: z.string(),
    store_id: z.string(),
    openings: z.number().int(),
    base_min: z.number(),
    base_max: z.number(),
    employment_type: EmploymentTypeSchema,
    target_start: z.string(),
    jd: JdInputSchema,
    copied_from: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const req = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: path.split("."), message });
    };
    req(!!v.department, "department", "Department is required");
    req(!!v.role, "role", "Role is required");
    req(!!v.store_id, "store_id", "Store is required");
    req(v.openings >= 1, "openings", "At least 1 opening");
    req(v.base_min > 0, "base_min", "Enter the base salary from");
    req(v.base_max > 0, "base_max", "Enter the base salary to");
    req(v.base_min <= v.base_max, "base_max", "Must be at least the 'from' amount");
    req(/^\d{4}-\d{2}-\d{2}$/.test(v.target_start), "target_start", "Pick a target start date");
    req(v.jd.about.trim().length > 0, "jd.about", "Required");
    req(v.jd.duties.filter((d) => d.trim()).length >= 3, "jd.duties", "At least 3 points, one per line");
    req(v.jd.requirements.filter((d) => d.trim()).length >= 1, "jd.requirements", "Required");
    req(v.jd.benefits.trim().length > 0, "jd.benefits", "Required");
  });

export const CompleteTaskBodySchema = z.object({
  output_data: z.record(z.unknown()),
});
