"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertTitle, Box, Button, Checkbox, Snackbar, TextField, Typography } from "@mui/material";
import type { Candidate, Requisition, Task } from "@/domain/types";
import { api } from "@/lib/api";
import { useSession } from "@/components/SessionProvider";
import { NextLink, PageHeader, SectionCard, StatusChip, WaitingBanner } from "@/components/ui";
import { ClosedBanner, toSubmitError, type SubmitState } from "./common";

export function ShortlistReviewTask({
  task,
  requisition: r,
  candidates,
  onChanged,
}: {
  task: Task;
  requisition: Requisition;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  const { bump } = useSession();
  const inputIds = new Set(((task.inputs.candidates as { id: string }[] | undefined) ?? []).map((c) => c.id));
  const mid = candidates.filter((c) => inputIds.has(c.id) || (!inputIds.size && c.band === "mid"));
  const auto = candidates.filter((c) => c.band === "hi");
  const [sel, setSel] = useState<Set<string>>(() => new Set(task.status === "done" ? mid.filter((c) => c.status === "ShortlistedByHr").map((c) => c.id) : []));
  const [note, setNote] = useState("");
  const [state, setState] = useState<SubmitState>(task.status === "closed" ? { kind: "closed" } : { kind: "idle" });
  const [done, setDone] = useState(task.status === "done");
  const [toast, setToast] = useState(false);
  const open = task.status === "open" && state.kind !== "closed" && !done;
  const names = mid.filter((c) => sel.has(c.id)).map((c) => c.name);
  const rest = mid.length - names.length;

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async () => {
    setState({ kind: "busy" });
    try {
      await api.tasks.complete(task.id, { selected_candidate_ids: [...sel], hr_note: note.trim() });
      setDone(true);
      setState({ kind: "idle" });
      bump();
    } catch (e) {
      setState(toSubmitError(e));
      onChanged();
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My tasks", href: "/tasks" }, { label: "Select candidates (70–89%)" }]}
        title={`Select candidates · ${r.role}, ${r.store}`}
        chips={<StatusChip tone="hr" label={`70–89% band · ${mid.length} candidates`} />}
        subtitle={
          <>
            {r.id} · {r.openings} openings · Already shortlisted automatically (90%+): {auto.map((c) => c.name).join(", ") || "none"} ·{" "}
            <NextLink href={`/requisitions/${r.id}/candidates`}>All candidates</NextLink>
          </>
        }
      />

      {open && (
        <WaitingBanner>
          <b>Opus is waiting on this step.</b> Flow 1b (job {task.execution_id.split("-").slice(0, 2).join("-")}) is paused at &quot;HR review 70–89%&quot;. Tick the candidates to shortlist. Everyone you don&apos;t tick gets the regret email.
        </WaitingBanner>
      )}
      {done && (
        <Alert severity="success" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>Sent to Opus.</AlertTitle>
          {names.length > 0
            ? `Shortlisted email going to ${names.join(", ")}, and Flow 2a starts for each. ${rest} regret email${rest === 1 ? "" : "s"} going out. `
            : `No one selected: all ${mid.length} get the regret email. `}
          <NextLink href={`/requisitions/${r.id}/candidates`}>View candidates</NextLink> · <NextLink href="/tasks">Next task</NextLink>
        </Alert>
      )}
      {state.kind === "closed" && <ClosedBanner reqId={r.id} />}

      <SectionCard title="Candidates scoring 70–89%" source={<Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}>Sorted by KitaHQ score</Typography>}>
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {mid.map((c) => {
            const on = sel.has(c.id);
            return (
              <Box
                component="li"
                key={c.id}
                sx={(theme) => ({
                  border: on ? 2 : 1,
                  borderColor: on ? "primary.main" : "divider",
                  bgcolor: on ? "#f3f8fd" : "transparent",
                  ...theme.applyStyles("dark", { bgcolor: on ? "rgba(144,202,249,.08)" : "transparent" }),
                  borderRadius: 1,
                  p: 2,
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  gap: "8px 16px",
                  alignItems: "start",
                })}
              >
                <Checkbox id={`c-${c.id}`} checked={on} onChange={() => toggle(c.id)} disabled={!open} sx={{ p: 0.5 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="label" htmlFor={`c-${c.id}`} sx={{ fontWeight: 500, fontSize: 16, cursor: open ? "pointer" : "default" }}>
                    {c.name}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                    {c.kitahq_note}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {c.tags.map((t) => (
                      <Box
                        key={t}
                        component="span"
                        sx={(theme) => ({ display: "inline-block", fontSize: 12, px: 1, py: 0.25, borderRadius: 2.5, bgcolor: "#eceff1", color: "#37474f", mr: 0.5, mt: 0.25, ...theme.applyStyles("dark", { bgcolor: "rgba(176,190,197,.16)", color: "#cfd8dc" }) })}
                      >
                        {t}
                      </Box>
                    ))}
                  </Box>
                  <Button size="small" sx={{ mt: 0.5, px: 0, minHeight: 0 }} onClick={() => setToast(true)}>
                    Watch KitaHQ interview
                  </Button>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: 28, lineHeight: 1.1 }}>{c.kitahq_score}%</Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                    KitaHQ score
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
        {open && (
          <Box sx={{ px: 2, pb: 2 }}>
            <TextField fullWidth id="hr-note" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </Box>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", justifyContent: "space-between", p: 2, borderTop: 1, borderColor: "divider" }} aria-live="polite">
          <Box>
            <b>{names.length} selected</b>{" "}
            <Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}>
              → shortlisted email + Flow 2a. {rest} not selected → regret email.
            </Typography>
          </Box>
          {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
          {open && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              <Button variant="outlined" component={Link} href="/tasks">
                Back
              </Button>
              <Button variant="contained" onClick={submit} disabled={state.kind === "busy"}>
                Send selection to Opus
              </Button>
            </Box>
          )}
        </Box>
      </SectionCard>
      <Snackbar open={toast} autoHideDuration={3000} onClose={() => setToast(false)} message="KitaHQ is mocked in the demo: no video available." />
    </>
  );
}
