"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertTitle, Box, Button, CardContent, TextField, Typography } from "@mui/material";
import type { Finding, JdSections, Requisition, Task } from "@/domain/types";
import { api } from "@/lib/api";
import { linesToList } from "@/lib/format";
import { useSession } from "@/components/SessionProvider";
import { FindingList, NextLink, PageHeader, SectionCard, StatusChip } from "@/components/ui";
import { JdSectionsEditor, fromDraft, toDraft, type JdKey } from "@/components/JdSectionsEditor";
import { formatMyt } from "@/lib/format";
import { ClosedBanner, toSubmitError, type SubmitState } from "./common";

export function HmReviseTask({ task, requisition: r, onChanged }: { task: Task; requisition: Requisition; onChanged: () => void }) {
  const { bump } = useSession();
  const jdIn = (task.inputs.jd_sections as JdSections | undefined) ?? r.jd_sections;
  const findings = ((task.inputs.findings as Finding[] | undefined) ?? []).filter((f) => f.result !== "pass");
  const hrComments = String(task.inputs.hr_comments ?? "");
  const returnedBy = String(task.inputs.returned_by ?? "HR");
  const flagged = (task.inputs.flagged_sections as JdKey[] | undefined) ?? [];
  const round = task.round ?? r.round;
  const [jd, setJd] = useState(toDraft(jdIn));
  const [note, setNote] = useState("");
  const [dutyErr, setDutyErr] = useState<string>();
  const [state, setState] = useState<SubmitState>(task.status === "closed" ? { kind: "closed" } : { kind: "idle" });
  const [sent, setSent] = useState(task.status === "done");
  const open = task.status === "open" && state.kind !== "closed" && !sent;

  const markers: Partial<Record<JdKey, string>> = {};
  for (const k of flagged) markers[k] = hrComments ? "Changed · HR comment" : "Flagged";

  const send = async () => {
    if (linesToList(jd.duties).length < 3) return setDutyErr("At least 3 points, one per line");
    setDutyErr(undefined);
    setState({ kind: "busy" });
    try {
      await api.tasks.complete(task.id, { revised_jd: fromDraft(jd), hm_note: note.trim() });
      setSent(true);
      setState({ kind: "idle" });
      bump();
    } catch (e) {
      setState(toSubmitError(e));
      onChanged();
    }
  };

  return (
    <>
      <Alert severity="warning" variant="outlined" role="note">
        <b>Variant, TBC.</b> This screen applies only if the HM &quot;Revise JD&quot; node is also set to Off-Platform. If it stays a normal Opus task, hiring managers do this inside Opus and need Opus accounts.
      </Alert>
      <PageHeader
        crumbs={[{ label: "My tasks", href: "/tasks" }, { label: "Revise JD" }]}
        title={`Revise JD · ${r.role}, ${r.store}`}
        chips={
          <>
            <StatusChip tone="ret" label={`Round ${round} of 3`} />
            <Box component="span" aria-label={`${round} of 3 review rounds used`} sx={{ display: "inline-flex", gap: 0.5 }}>
              {[1, 2, 3].map((i) => (
                <Box key={i} component="span" sx={{ width: 22, height: 6, borderRadius: 3, bgcolor: i <= round ? "#f48fb1" : "action.disabled" }} />
              ))}
            </Box>
          </>
        }
        subtitle={`${r.id} · Returned by ${returnedBy}${returnedBy === "AI pre-check" ? "" : " (HR)"} on ${formatMyt(task.created_at, "full")} · ${round >= 2 ? "Round 3 is the last review round" : "Up to 2 more review rounds after this"}`}
      />

      {sent && (
        <Alert severity="success" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>Resubmitted.</AlertTitle>
          Opus is running the AI pre-check again, then HR verifies round {round + 1}. <NextLink href={`/requisitions/${r.id}`}>Track progress</NextLink>
        </Alert>
      )}
      {state.kind === "closed" && <ClosedBanner reqId={r.id} />}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.4fr) minmax(0, 1fr)" }, gap: 3, alignItems: "start" }}>
        <SectionCard title="Job description">
          <CardContent>
            <Typography color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>
              Edit the sections HR or the AI pre-check flagged. Title, store and salary come from the requisition.
            </Typography>
            <JdSectionsEditor idPrefix="m" value={jd} onChange={setJd} howToApply={jdIn.how_to_apply} markers={markers} errors={{ duties: dutyErr }} disabled={!open} />
          </CardContent>
        </SectionCard>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, minWidth: 0 }}>
          <SectionCard title="What to change">
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {hrComments && (
                <Box>
                  <Typography sx={{ fontWeight: 500, fontSize: 14 }}>HR comments ({returnedBy})</Typography>
                  <Box sx={{ mt: 0.75, borderLeft: "3px solid #ffa726", bgcolor: "rgba(255,167,38,.1)", px: 1.5, py: 1, fontSize: 14 }}>&quot;{hrComments}&quot;</Box>
                </Box>
              )}
              {findings.length > 0 ? <FindingList findings={findings} /> : !hrComments && <Typography color="text.secondary">No findings.</Typography>}
            </CardContent>
          </SectionCard>
          <SectionCard title="Resubmit">
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField id="note" label="Note to HR (optional)" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!open} />
              {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
              {open && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end" }}>
                  <Button variant="outlined" component={Link} href="/tasks">
                    Back
                  </Button>
                  <Button variant="contained" onClick={send} disabled={state.kind === "busy"}>
                    Resubmit to Opus
                  </Button>
                </Box>
              )}
            </CardContent>
          </SectionCard>
        </Box>
      </Box>
    </>
  );
}
