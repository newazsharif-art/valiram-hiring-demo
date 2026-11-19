"use client";
/**
 * Requisition form shared by New requisition and the Opus "Revise requisition" task (spec 02 §8):
 * form state helpers, client-side validation and the Role details fields.
 * The JD sections use JdSectionsEditor directly.
 */
import { CardContent, MenuItem, TextField } from "@mui/material";
import { EmploymentTypeSchema, RequisitionInputSchema } from "@/domain/schemas";
import type { EmploymentType, Requisition, RequisitionInput, Settings } from "@/domain/types";
import { fromDraft, toDraft, type JdDraft, type JdKey } from "@/components/JdSectionsEditor";

export interface RequisitionForm {
  department: string;
  role: string;
  store_id: string;
  openings: string;
  target_start: string;
  base_min: string;
  base_max: string;
  employment_type: EmploymentType;
  jd: JdDraft;
}

export const EMPTY_FORM: RequisitionForm = {
  department: "",
  role: "",
  store_id: "",
  openings: "1",
  target_start: "",
  base_min: "",
  base_max: "",
  employment_type: "Full-time",
  jd: toDraft(undefined),
};

const num = (s: string) => Number(String(s).replace(/[,\s]/g, ""));
const money = (n: number) => (n ? n.toLocaleString("en-MY") : "");

export function formFromRequisition(r: Requisition): RequisitionForm {
  return {
    department: r.department,
    role: r.role,
    store_id: r.store_id,
    openings: String(r.openings),
    target_start: r.target_start,
    base_min: money(r.base_min),
    base_max: money(r.base_max),
    employment_type: r.employment_type,
    jd: toDraft(r.jd_sections),
  };
}

export function formFromInput(i: RequisitionInput): RequisitionForm {
  return {
    department: i.department,
    role: i.role,
    store_id: i.store_id,
    openings: String(i.openings),
    target_start: i.target_start,
    base_min: money(i.base_min),
    base_max: money(i.base_max),
    employment_type: i.employment_type,
    jd: toDraft({ ...i.jd, how_to_apply: "" }),
  };
}

export function formToInput(form: RequisitionForm, copiedFrom?: string): RequisitionInput {
  return {
    department: form.department,
    role: form.role,
    store_id: form.store_id,
    openings: Math.trunc(num(form.openings) || 0),
    base_min: num(form.base_min) || 0,
    base_max: num(form.base_max) || 0,
    employment_type: form.employment_type,
    target_start: form.target_start,
    jd: fromDraft(form.jd),
    copied_from: copiedFrom,
  };
}

/** Client-side check with the same schema the server uses. Returns field → message (empty = valid). */
export function validateForm(input: RequisitionInput): Record<string, string> {
  const parsed = RequisitionInputSchema.safeParse(input);
  const errs: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[i.path.length - 1] as string] ??= i.message;
  return errs;
}

export function jdErrors(errors: Record<string, string>): Partial<Record<JdKey, string>> {
  return { about: errors.about, duties: errors.duties, requirements: errors.requirements, benefits: errors.benefits };
}

/** Values Opus sent that don't match Settings (Revise requisition only). */
export interface Unmatched {
  department?: string;
  role?: string;
  store?: string;
}

const notInSettings = (v: string) => `Opus sent "${v}", which isn't in Settings. Choose one.`;

/** Role details: department → role (filtered), store → region, employment type, openings, start date, salary. */
export function RequisitionFormFields({
  form,
  onChange,
  errors,
  settings: s,
  disabled,
  unmatched,
}: {
  form: RequisitionForm;
  onChange: (patch: Partial<RequisitionForm>) => void;
  errors: Record<string, string>;
  settings: Settings;
  disabled?: boolean;
  unmatched?: Unmatched;
}) {
  const dept = s.departments.find((d) => d.name === form.department);
  const store = s.stores.find((x) => x.id === form.store_id);
  const hint = (field: keyof Unmatched, value: string, fallback: string) =>
    errors[field === "store" ? "store_id" : field] ?? (!value && unmatched?.[field] ? notInSettings(unmatched[field]!) : fallback);
  return (
    <CardContent sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
      <TextField
        select
        required
        label="Department"
        value={form.department}
        onChange={(e) => onChange({ department: e.target.value, role: "" })}
        disabled={disabled}
        error={!!errors.department || (!form.department && !!unmatched?.department)}
        helperText={hint("department", form.department, "Required")}
      >
        {s.departments.filter((d) => d.active).map((d) => (
          <MenuItem key={d.id} value={d.name}>
            {d.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        required
        label="Role"
        value={form.role}
        onChange={(e) => onChange({ role: e.target.value })}
        disabled={disabled || !dept}
        error={!!errors.role || (!form.role && !!unmatched?.role)}
        helperText={hint("role", form.role, dept ? "Roles under the chosen department" : "Choose a department first")}
      >
        {(dept?.roles ?? []).map((r) => (
          <MenuItem key={r} value={r}>
            {r}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        required
        label="Store"
        value={form.store_id}
        onChange={(e) => onChange({ store_id: e.target.value })}
        disabled={disabled}
        error={!!errors.store_id || (!form.store_id && !!unmatched?.store)}
        helperText={hint("store", form.store_id, store ? `Region fills in: ${store.region}` : "Region fills in from the store")}
      >
        {s.stores.filter((x) => x.active).map((x) => (
          <MenuItem key={x.id} value={x.id}>
            {x.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Region" value={store?.region ?? ""} slotProps={{ input: { readOnly: true } }} helperText="From Settings · Stores & regions" disabled={disabled} />
      <TextField
        select
        required
        label="Employment type"
        value={form.employment_type}
        onChange={(e) => onChange({ employment_type: e.target.value as EmploymentType })}
        disabled={disabled}
        error={!!errors.employment_type}
        helperText={errors.employment_type}
      >
        {EmploymentTypeSchema.options.map((t) => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        required
        label="Openings"
        type="number"
        value={form.openings}
        onChange={(e) => onChange({ openings: e.target.value })}
        disabled={disabled}
        error={!!errors.openings}
        helperText={errors.openings}
        slotProps={{ htmlInput: { min: 1 } }}
      />
      <TextField
        required
        label="Target start date"
        type="date"
        value={form.target_start}
        onChange={(e) => onChange({ target_start: e.target.value })}
        disabled={disabled}
        error={!!errors.target_start}
        helperText={errors.target_start}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        required
        label="Base salary from (RM / month)"
        value={form.base_min}
        onChange={(e) => onChange({ base_min: e.target.value })}
        disabled={disabled}
        error={!!errors.base_min}
        helperText={errors.base_min}
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
      <TextField
        required
        label="Base salary to (RM / month)"
        value={form.base_max}
        onChange={(e) => onChange({ base_max: e.target.value })}
        disabled={disabled}
        error={!!errors.base_max}
        helperText={errors.base_max}
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
    </CardContent>
  );
}
