"use client";
/**
 * "Review requisition" for an HR final check task delivered by the real Opus webhook (spec 03 §8):
 * the round history (read only), the requisition form prefilled from Opus, and the decision.
 * Send decision posts the reviewed JSON, the pass flag and the HR message to the Opus callback API.
 */
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertTitle, Box, Button, CardContent, FormControlLabel, Radio, RadioGroup, TextField, Typography } from "@mui/material";
import type { Requisition, RequisitionInput, Task } from "@/domain/types";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { ErrorNote, FindingList, Loading, NextLink, PageHeader, SectionCard, StatusChip, WaitingBanner } from "@/components/ui";
import { JdSectionsEditor } from "@/components/JdSectionsEditor";
import {
  RequisitionFormFields,
  formFromInput,
  formFromRequisition,
  formToInput,
  jdErrors,
  validateForm,
  type RequisitionForm,
  type Unmatched,
} from "@/components/RequisitionFormFields";
import { formatMyt, waitingFor } from "@/lib/format";
import { ClosedBanner, toSubmitError, type SubmitState } from "./common";

type Decision = "" | "approve" | "return";

const omit = (e: Record<string, string>, key: string) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key));

export function OpusHrReviewTask({ task, requisition: r, onChanged }: { task: Task; requisition: Requisition; onChanged: () => void }) {
  const { bump } = useSession();
  const settings = useApi(() => api.settings.get(), []);
  const prefill = task.inputs.prefill as RequisitionInput | undefined;
  const unmatched = (task.inputs.unmatched as Unmatched | undefined) ?? {};
  const round = task.round ?? r.round;
  const review = r.reviews.find((x) => x.round === round);
  const [form, setForm] = useState<RequisitionForm>(prefill ? formFromInput(prefill) : formFromRequisition(r));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Decision>("");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<SubmitState>(task.status === "closed" ? { kind: "closed" } : { kind: "idle" });
  const [result, setResult] = useState<string | null>(task.status === "done" ? (task.outcome ?? "done") : null);
  const open = task.status === "open" && state.kind !== "closed" && !result;
  const set = (patch: Partial<RequisitionForm>) => setForm((f) => ({ ...f, ...patch }));

  if (settings.error) return <ErrorNote error={settings.error} />;
  if (!settings.data) return <Loading />;
  const s = settings.data;

  const send = async () => {
    const input = formToInput(form);
    const errs = validateForm(input);
    if (!decision) errs.decision = "Choose a decision.";
    if (decision === "return" && !comment.trim()) errs.hr_comments = "Add a comment so the hiring manager knows what to change.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setState({ kind: "error", message: "Please fix the highlighted fields." });
      return;
    }
    setState({ kind: "busy" });
    try {
      await api.tasks.complete(task.id, { requisition: input, decision, hr_comments: comment.trim() });
      setResult(decision);
      setState({ kind: "idle" });
      bump();
    } catch (e) {
      const st = toSubmitError(e);
      if (st.kind === "error" && st.field) setErrors({ [st.field.split(".").pop()!]: st.message });
      setState(st);
      onChanged();
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My tasks", href: "/tasks" }, { label: "Review requisition" }]}
        title={`Review requisition · ${r.role}, ${r.store}`}
        chips={<StatusChip tone="hr" label={`Round ${round} of 3`} />}
        subtitle={`${r.id} · Hiring manager ${r.hm_name} · Assigned to ${task.assignee_name}`}
      />

      {open && (
        <WaitingBanner>
          <b>Opus is waiting on this step.</b> The workflow is paused at &quot;Round {round} · HR final check&quot;. Waiting {waitingFor(task.created_at)}. Your decision is sent back once and the
          workflow continues straight away.
        </WaitingBanner>
      )}
      {result === "approve" && (
        <Alert severity="success" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>{task.outcome_label === "Approved with edits" ? "Approved with your edits." : "Approved."}</AlertTitle>
          Sent to Opus. The job posting was generated and the JD is live. <NextLink href={`/requisitions/${r.id}`}>Track the requisition</NextLink> ·{" "}
          <NextLink href="/tasks">Next task</NextLink>
        </Alert>
      )}
      {result === "return" && (
        <Alert severity="warning" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>Returned to {r.hm_name} (round {round + 1} of 3 follows).</AlertTitle>
          Sent to Opus with your message. The hiring manager gets a task when Opus reaches the next review step. <NextLink href="/tasks">Next task</NextLink>
        </Alert>
      )}
      {state.kind === "closed" && <ClosedBanner reqId={r.id} />}

      {review && (review.precheck || review.hm) && (
        <SectionCard title={`Round ${round} history`}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {review.precheck && (
              <Box>
                <Typography sx={{ fontWeight: 500, mb: 0.5 }}>
                  AI pre-check · {review.precheck.pass ? "passed" : "needed changes"} ({formatMyt(review.precheck.at, "full")})
                </Typography>
                {review.precheck.findings.length > 0 && (
                  <Box sx={{ whiteSpace: "pre-line" }}>
                    <FindingList findings={review.precheck.findings} />
                  </Box>
                )}
              </Box>
            )}
            {review.hm && (
              <Typography sx={{ fontSize: 14 }}>
                <b>{review.hm.by}</b> resubmitted on {formatMyt(review.hm.at, "full")}
                {review.hm.note ? `: "${review.hm.note}"` : "."}
              </Typography>
            )}
          </CardContent>
        </SectionCard>
      )}

      <SectionCard title="Role details">
        <RequisitionFormFields form={form} onChange={set} errors={errors} settings={s} disabled={!open} unmatched={unmatched} />
      </SectionCard>

      <SectionCard title="Job description">
        <CardContent>
          <JdSectionsEditor idPrefix="hr" value={form.jd} onChange={(jd) => set({ jd })} howToApply={r.jd_sections.how_to_apply} errors={jdErrors(errors)} disabled={!open} />
        </CardContent>
      </SectionCard>

      {open && (
        <SectionCard title="Your decision">
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <RadioGroup
              aria-label="Decision"
              value={decision}
              onChange={(e) => {
                setDecision(e.target.value as Decision);
                setErrors((e) => omit(e, "decision"));
              }}
              sx={{ gap: 1 }}
            >
              {[
                { v: "approve", t: "Approve and publish", d: "Generate the job posting and mark the JD live.", c: "success.main" },
                { v: "return", t: "Return to hiring manager", d: `They revise; round ${round + 1} of 3 follows. Message required.`, c: "error.main" },
              ].map((o) => (
                <FormControlLabel
                  key={o.v}
                  value={o.v}
                  control={<Radio />}
                  sx={{ m: 0, border: 1, borderColor: decision === o.v ? o.c : "divider", borderRadius: 1, p: 1, alignItems: "flex-start", "& .MuiRadio-root": { pt: 0.25 } }}
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 500 }}>{o.t}</Typography>
                      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                        {o.d}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
            {errors.decision && (
              <Typography color="error" role="alert" sx={{ fontSize: 13 }}>
                {errors.decision}
              </Typography>
            )}
            <TextField
              id="hr-message"
              label={decision === "return" ? "HR Response Message (required)" : "HR Response Message (optional)"}
              multiline
              minRows={3}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setErrors((e) => omit(e, "hr_comments"));
              }}
              error={!!errors.hr_comments}
              helperText={errors.hr_comments ?? "Sent to Opus with your decision."}
              required={decision === "return"}
            />
            {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end" }}>
              <Button variant="outlined" component={Link} href="/tasks">
                Back
              </Button>
              <Button variant="contained" onClick={send} disabled={state.kind === "busy"}>
                Send decision to Opus
              </Button>
            </Box>
          </CardContent>
        </SectionCard>
      )}
    </>
  );
}
