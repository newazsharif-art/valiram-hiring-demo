"use client";
/**
 * "Revise requisition" for a task delivered by the real Opus webhook (spec 02 §8, spec 04 §8):
 * the Message to Hiring Manager (round 1, from the AI pre-check) or the HR Response Message
 * (rounds 2 and 3, from HR), read only, and the New requisition form, prefilled from Opus.
 * Resubmit sends the fields to the Opus callback API; on success the requisition is With HR.
 */
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertTitle, Box, Button, CardContent, Typography } from "@mui/material";
import type { Requisition, RequisitionInput, Task } from "@/domain/types";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { ErrorNote, Loading, NextLink, PageHeader, SectionCard, StatusChip } from "@/components/ui";
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
import { formatMyt } from "@/lib/format";
import { ClosedBanner, toSubmitError, type SubmitState } from "./common";

export function OpusReviseTask({ task, requisition: r, onChanged }: { task: Task; requisition: Requisition; onChanged: () => void }) {
  const { bump } = useSession();
  const settings = useApi(() => api.settings.get(), []);
  const prefill = task.inputs.prefill as RequisitionInput | undefined;
  const unmatched = (task.inputs.unmatched as Unmatched | undefined) ?? {};
  const message = String(task.inputs.message ?? "");
  const round = task.round ?? r.round;
  const returnedBy = String(task.inputs.returned_by ?? "AI pre-check");
  const fromHr = returnedBy !== "AI pre-check";
  const [form, setForm] = useState<RequisitionForm>(prefill ? formFromInput(prefill) : formFromRequisition(r));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<SubmitState>(task.status === "closed" ? { kind: "closed" } : { kind: "idle" });
  const [sent, setSent] = useState(task.status === "done");
  const open = task.status === "open" && state.kind !== "closed" && !sent;
  const set = (patch: Partial<RequisitionForm>) => setForm((f) => ({ ...f, ...patch }));

  if (settings.error) return <ErrorNote error={settings.error} />;
  if (!settings.data) return <Loading />;
  const s = settings.data;

  const send = async () => {
    const input = formToInput(form);
    const errs = validateForm(input);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setState({ kind: "error", message: "Please fix the highlighted fields." });
      return;
    }
    setState({ kind: "busy" });
    try {
      await api.tasks.complete(task.id, { requisition: input });
      setSent(true);
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
        crumbs={[{ label: "My tasks", href: "/tasks" }, { label: "Revise requisition" }]}
        title={`Revise requisition · ${r.role}, ${r.store}`}
        chips={<StatusChip tone="ret" label={`Round ${round} of 3`} />}
        subtitle={
          fromHr
            ? `${r.id} · Returned by ${returnedBy} (HR) on ${formatMyt(task.created_at, "full")} · ${round >= 3 ? "This is the last review round" : `Round ${round + 1} is the last review round`}`
            : `${r.id} · Returned by the AI pre-check on ${formatMyt(task.created_at, "full")}`
        }
      />

      {sent && (
        <Alert severity="success" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>Resubmitted.</AlertTitle>
          Your changes were sent to Opus. The requisition is now with HR. <NextLink href={`/requisitions/${r.id}`}>Track progress</NextLink>
        </Alert>
      )}
      {state.kind === "closed" && <ClosedBanner reqId={r.id} />}

      {message.trim() && (
        <Alert severity="info" role="note">
          <AlertTitle sx={{ fontWeight: 500 }}>{fromHr ? "HR Response Message" : "Message to Hiring Manager"}</AlertTitle>
          <Box component="span" sx={{ whiteSpace: "pre-line" }}>
            {message.trim()}
          </Box>
        </Alert>
      )}

      <SectionCard title="Role details">
        <RequisitionFormFields form={form} onChange={set} errors={errors} settings={s} disabled={!open} unmatched={unmatched} />
      </SectionCard>

      <SectionCard title="Job description">
        <CardContent>
          <JdSectionsEditor idPrefix="o" value={form.jd} onChange={(jd) => set({ jd })} howToApply={r.jd_sections.how_to_apply} errors={jdErrors(errors)} disabled={!open} />
        </CardContent>
      </SectionCard>

      <SectionCard title="Resubmit">
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            All fields above are sent to Opus.
          </Typography>
          {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
          {open && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end" }}>
              <Button variant="outlined" component={Link} href="/tasks">
                Back
              </Button>
              <Button variant="contained" onClick={send} disabled={state.kind === "busy"}>
                Resubmit
              </Button>
            </Box>
          )}
        </CardContent>
      </SectionCard>
    </>
  );
}
