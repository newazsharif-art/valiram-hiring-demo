import type { z } from "zod";
import type {
  ActivitySchema,
  BandSchema,
  CandidateSchema,
  CandidateStatusSchema,
  ConnectionSchema,
  DemoStateSchema,
  DepartmentSchema,
  FindingSchema,
  JdInputSchema,
  JdSectionsSchema,
  JdVersionSchema,
  NodeMapSchema,
  RequisitionInputSchema,
  RequisitionSchema,
  RequisitionStatusSchema,
  ReviewRoundSchema,
  RoleSchema,
  SettingsSchema,
  ShortlistRulesSchema,
  ShortlistStateSchema,
  StoreSchema,
  TaskSchema,
  TaskTypeSchema,
  TemplateSectionSchema,
  UserSchema,
} from "./schemas";

export type Role = z.infer<typeof RoleSchema>;
export type RequisitionStatus = z.infer<typeof RequisitionStatusSchema>;
export type JdSections = z.infer<typeof JdSectionsSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ReviewRound = z.infer<typeof ReviewRoundSchema>;
export type JdVersion = z.infer<typeof JdVersionSchema>;
export type ActivityEntry = z.infer<typeof ActivitySchema>;
export type ShortlistState = z.infer<typeof ShortlistStateSchema>;
export type Requisition = z.infer<typeof RequisitionSchema>;
export type Band = z.infer<typeof BandSchema>;
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type User = z.infer<typeof UserSchema>;
export type Department = z.infer<typeof DepartmentSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type TemplateSection = z.infer<typeof TemplateSectionSchema>;
export type ShortlistRules = z.infer<typeof ShortlistRulesSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type NodeMap = z.infer<typeof NodeMapSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type DemoState = z.infer<typeof DemoStateSchema>;
export type JdInput = z.infer<typeof JdInputSchema>;
export type RequisitionInput = z.infer<typeof RequisitionInputSchema>;

/** Server-only: the Off-Platform callback Opus gave us. Never sent to the browser. */
export interface TaskCallback {
  url: string;
  token: string;
  token_header: string;
}

export interface TaskRecord extends Task {
  callback: TaskCallback;
}

export const MAX_ROUNDS = 3;
