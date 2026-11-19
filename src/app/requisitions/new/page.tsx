"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { EmploymentTypeSchema, RequisitionInputSchema } from "@/domain/schemas";
import type { EmploymentType, Requisition, RequisitionInput } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { ErrorNote, Loading, NextLink, PageHeader, SectionCard } from "@/components/ui";
import { JdSectionsEditor, fromDraft, toDraft, type JdDraft, type JdKey } from "@/components/JdSectionsEditor";

interface Form {
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

const EMPTY: Form = { department: "", role: "", store_id: "", openings: "1", target_start: "", base_min: "", base_max: "", employment_type: "Full-time", jd: toDraft(undefined) };

const EXAMPLE: Form = {
  department: "Beauty & Fragrance",
  role: "Fragrance Specialist",
  store_id: "klia2",
  openings: "3",
  target_start: "2027-01-04",
  base_min: "1,900",
  base_max: "2,300",
  employment_type: "Full-time",
  jd: {
    about: "Help travellers find the perfect fragrance or gift before their flight in our duty-free store at KLIA2, Pier L.",
    duties: "Welcome and advise international travellers\nMeet personal and store sales targets\nKeep displays and stock in order; support stock counts",
    requirements: "Confident speaker in English and Bahasa Malaysia; Mandarin is a plus\nAble to work rotating shifts including nights, weekends and public holidays",
    benefits: "Staff discount, sales commission, EPF, SOCSO, medical, shift allowance, uniform provided",
    shift_pattern: "Rotating 8-hour shifts across 24 hours, 6 days a week",
  },
};

const num = (s: string) => Number(String(s).replace(/[,\s]/g, ""));

function fromReq(r: Requisition): Form {
  return {
    department: r.department,
    role: r.role,
    store_id: r.store_id,
    openings: String(r.openings),
    target_start: r.target_start,
    base_min: r.base_min ? r.base_min.toLocaleString("en-MY") : "",
    base_max: r.base_max ? r.base_max.toLocaleString("en-MY") : "",
    employment_type: r.employment_type,
    jd: toDraft(r.jd_sections),
  };
}

function NewRequisitionInner() {
  const params = useSearchParams();
  const router = useRouter();
  const draftId = params.get("draft");
  const { user, bump } = useSession();
  const settings = useApi(() => api.settings.get(), []);
  const [form, setForm] = useState<Form>(EMPTY);
  const [draft, setDraft] = useState<Requisition | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "submitted" | "saved"; r: Requisition } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!draftId) {
      setDraft(null);
      return;
    }
    api.requisitions
      .get(draftId)
      .then((r) => {
        setDraft(r);
        setForm(fromReq(r));
      })
      .catch((e: Error) => setError(e.message));
  }, [draftId]);

  if (settings.error) return <ErrorNote error={settings.error} />;
  if (!settings.data) return <Loading />;
  const s = settings.data;
  const dept = s.departments.find((d) => d.name === form.department);
  const store = s.stores.find((x) => x.id === form.store_id);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  if (user.role !== "HIRING_MANAGER") {
    return (
      <>
        <PageHeader title="New requisition" subtitle="Hiring managers create requisitions." />
        <Alert severity="info">Switch to the hiring manager (Jason Lim) in the user menu to create a requisition.</Alert>
      </>
    );
  }

  const toInput = (action: "draft" | "submit"): RequisitionInput => ({
    action,
    department: form.department,
    role: form.role,
    store_id: form.store_id,
    openings: Math.trunc(num(form.openings) || 0),
    base_min: num(form.base_min) || 0,
    base_max: num(form.base_max) || 0,
    employment_type: form.employment_type,
    target_start: form.target_start,
    jd: fromDraft(form.jd),
    copied_from: draft?.copied_from,
  });

  const save = async (action: "draft" | "submit") => {
    setError(undefined);
    setResult(null);
    const input = toInput(action);
    const parsed = RequisitionInputSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path[i.path.length - 1] as string] ??= i.message;
      setErrors(errs);
      setError("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = draft ? await api.requisitions.updateDraft(draft.id, input) : await api.requisitions.create(input);
      bump();
      if (action === "submit") {
        setResult({ kind: "submitted", r });
        setDraft(null);
        setForm(EMPTY);
        if (draftId) router.replace("/requisitions/new");
      } else {
        setResult({ kind: "saved", r });
        setDraft(r);
        if (!draftId) router.replace(`/requisitions/new?draft=${r.id}`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const err = e as ApiClientError;
      setError(err.message);
      if (err.field) setErrors({ [err.field.split(".").pop()!]: err.message });
    } finally {
      setBusy(false);
    }
  };

  const jdErrors: Partial<Record<JdKey, string>> = {
    about: errors.about,
    duties: errors.duties,
    requirements: errors.requirements,
    benefits: errors.benefits,
  };

  return (
    <>
      <PageHeader
        crumbs={draft ? [{ label: "Requisitions", href: "/requisitions" }, { label: `${draft.id} (draft)` }] : undefined}
        title={draft ? `Draft ${draft.id}` : "New requisition"}
        subtitle='Fill in the role and write the JD. Submitting starts the Opus "Publish JD" workflow.'
        actions={
          <Button variant="text" onClick={() => setForm(EXAMPLE)}>
            Fill example
          </Button>
        }
      />

      {draft?.copied_from && (
        <Alert severity="info">
          Copied from <NextLink href={`/requisitions/${draft.copied_from}`}>{draft.copied_from}</NextLink> (rejected after round 3). Submitting starts a fresh Flow 1 with 3 new review rounds.
        </Alert>
      )}
      {result?.kind === "submitted" && (
        <Alert severity="success" role="status">
          <b>Submitted as {result.r.id}.</b> Opus job {result.r.opus_job_ids.flow1?.split("-").slice(0, 2).join("-")} started. The AI pre-check usually takes under a minute; you will get a task here if anything needs fixing.{" "}
          <NextLink href={`/requisitions/${result.r.id}`}>Track progress</NextLink>
        </Alert>
      )}
      {result?.kind === "saved" && (
        <Alert severity="success" role="status">
          Draft saved as {result.r.id}. Nothing was sent to Opus.
        </Alert>
      )}
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, gap: 3, alignItems: "start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <SectionCard title="Role details">
            <CardContent sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
              <TextField
                select
                required
                label="Department"
                value={form.department}
                onChange={(e) => set({ department: e.target.value, role: "" })}
                error={!!errors.department}
                helperText={errors.department ?? "Required"}
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
                onChange={(e) => set({ role: e.target.value })}
                disabled={!dept}
                error={!!errors.role}
                helperText={errors.role ?? (dept ? "Roles under the chosen department" : "Choose a department first")}
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
                onChange={(e) => set({ store_id: e.target.value })}
                error={!!errors.store_id}
                helperText={errors.store_id ?? (store ? `Region fills in: ${store.region}` : "Region fills in from the store")}
              >
                {s.stores.filter((x) => x.active).map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {x.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Region" value={store?.region ?? ""} slotProps={{ input: { readOnly: true } }} helperText="From Settings · Stores & regions" />
              <TextField
                select
                required
                label="Employment type"
                value={form.employment_type}
                onChange={(e) => set({ employment_type: e.target.value as EmploymentType })}
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
                onChange={(e) => set({ openings: e.target.value })}
                error={!!errors.openings}
                helperText={errors.openings}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                required
                label="Target start date"
                type="date"
                value={form.target_start}
                onChange={(e) => set({ target_start: e.target.value })}
                error={!!errors.target_start}
                helperText={errors.target_start}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                required
                label="Base salary from (RM / month)"
                value={form.base_min}
                onChange={(e) => set({ base_min: e.target.value })}
                error={!!errors.base_min}
                helperText={errors.base_min}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
              <TextField
                required
                label="Base salary to (RM / month)"
                value={form.base_max}
                onChange={(e) => set({ base_max: e.target.value })}
                error={!!errors.base_max}
                helperText={errors.base_max}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
            </CardContent>
          </SectionCard>

          <SectionCard title="Job description">
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Alert severity="info" icon={false}>
                Job title, store, salary range and employment type come from Role details above. Opus adds them to every posting, so don&apos;t repeat them here.
              </Alert>
              <JdSectionsEditor value={form.jd} onChange={(jd) => set({ jd })} howToApply={s.template.how_to_apply} errors={jdErrors} idPrefix="s" />
            </CardContent>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end", p: 2, borderTop: 1, borderColor: "divider" }}>
              <Button variant="outlined" disabled={busy} onClick={() => save("draft")}>
                Save draft
              </Button>
              <Button variant="contained" disabled={busy} onClick={() => save("submit")}>
                Submit to HR
              </Button>
            </Box>
          </SectionCard>
        </Box>

        <Card component="aside" aria-label="What happens next">
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h2">What happens next</Typography>
            <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {[
                ["AI pre-check", "Wording, Valiram rules (no CV, degree or SPM demands), content in the wrong place, quality", false],
                ["HR verification", "An HR recruiter approves, edits or returns it with comments", true],
                ["Job posting · JD live", "Demo: Opus creates a LinkedIn-style job post as a PDF, with the KitaHQ apply link", false],
              ].map(([t, d, h], i) => (
                <Box component="li" key={String(t)} sx={{ display: "flex", gap: 1.5 }}>
                  <Box
                    aria-hidden
                    sx={(theme) => ({
                      width: 26,
                      height: 26,
                      flex: "none",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: 500,
                      bgcolor: h ? "#ef6c00" : "#1976d2",
                      color: "#fff",
                      ...theme.applyStyles("dark", { bgcolor: h ? "#ffb74d" : "#90caf9", color: h ? "#3e2700" : "#0b1c2c" }),
                    })}
                  >
                    {i + 1}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{t}</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                      {d}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            <Alert severity="info">
              If the JD is returned, you get a &quot;Revise JD&quot; task. Up to 3 review rounds; if still not approved, the requisition closes as Rejected and you can copy it to a new one.
            </Alert>
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

export default function NewRequisitionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewRequisitionInner />
    </Suspense>
  );
}
