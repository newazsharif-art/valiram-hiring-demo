"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertTitle, Box, Button, CardContent, FormControlLabel, Radio, RadioGroup, TextField, Typography } from "@mui/material";
import type { Finding, JdSections, Requisition, Task } from "@/domain/types";
import { api } from "@/lib/api";
import { useSession } from "@/components/SessionProvider";
import { DataSourceBadge, FindingList, KeyValues, NextLink, PageHeader, SectionCard, StatusChip, WaitingBanner } from "@/components/ui";
import { JdSectionsEditor, fromDraft, toDraft } from "@/components/JdSectionsEditor";
import { formatMyt, range, waitingFor } from "@/lib/format";
import { ClosedBanner, toSubmitError, type SubmitState } from "./common";

export function HrVerifyTask({ task, requisition: r, onChanged }: { task: Task; requisition: Requisition; onChanged: () => void }) {
  const { bump } = useSession();
  const jdIn = (task.inputs.jd_sections as JdSections | undefined) ?? r.jd_sections;
  const findings = (task.inputs.findings as Finding[] | undefined) ?? r.reviews.find((x) => x.round === task.round)?.precheck?.findings ?? [];
  const round = task.round ?? r.round;
  const finalRound = round >= 3;
  const [jd, setJd] = useState(toDraft(jdIn));
  const [edited, setEdited] = useState(false);
  const [decision, setDecision] = useState<"" | "approve" | "reject">("");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<SubmitState>(task.status === "closed" ? { kind: "closed" } : { kind: "idle" });
  const [commentErr, setCommentErr] = useState<string>();
  const [decisionErr, setDecisionErr] = useState<string>();
  const [result, setResult] = useState<string | null>(task.status === "done" ? task.outcome ?? "done" : null);
  const passed = findings.filter((f) => f.result === "pass").length;
  const checks = findings.filter((f) => f.result !== "advisory").length;
  const open = task.status === "open" && state.kind !== "closed" && !result;

  const submit = async () => {
    setDecisionErr(undefined);
    setCommentErr(undefined);
    if (!decision) return setDecisionErr("Choose a decision.");
    if (decision === "reject" && !comment.trim()) {
      return setCommentErr(finalRound ? "Add a comment explaining why the requisition is rejected." : "Add a comment so the hiring manager knows what to change.");
    }
    setState({ kind: "busy" });
    try {
      await api.tasks.complete(task.id, {
        decision,
        edited_jd: { ...fromDraft(jd) },
        hr_comments: comment.trim(),
      });
      setResult(decision);
      setState({ kind: "idle" });
      bump();
    } catch (e) {
      setState(toSubmitError(e));
      onChanged();
    }
  };

  const returnLabel = finalRound ? "Reject requisition" : "Return to hiring manager";
  return (
    <>
      <PageHeader
        crumbs={[{ label: "My tasks", href: "/tasks" }, { label: "Verify JD" }]}
        title={`Verify JD · ${r.role}, ${r.store}`}
        chips={<StatusChip tone="hr" label={`Round ${round} of 3`} />}
        subtitle={`${r.id} · Submitted by ${r.hm_name} (HM) on ${formatMyt(r.versions[r.versions.length - 1]?.at ?? r.created_at, "full")} · Assigned to ${task.assignee_name}`}
      />

      {open && (
        <WaitingBanner>
          <b>Opus is waiting on this step.</b> Flow 1 (job {task.execution_id.split("-").slice(0, 2).join("-")}) is paused at &quot;HR verification&quot;. Waiting {waitingFor(task.created_at)}. Your decision is sent back once and the workflow continues straight away.
          <Box sx={{ mt: 0.5 }}>
            <DataSourceBadge kind="task">Opus task payload · execution_id, callback, expected_output_schema</DataSourceBadge>
          </Box>
        </WaitingBanner>
      )}
      {result === "approve" && (
        <Alert severity="success" role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>{edited || task.outcome_label === "Approved with edits" ? "Approved with your edits." : "Approved."}</AlertTitle>
          Sent to Opus. Flow 1 resumed: job posting (LinkedIn-style PDF in the demo) → JD live. <NextLink href={`/requisitions/${r.id}`}>Track the requisition</NextLink> · <NextLink href="/tasks">Next task</NextLink>
        </Alert>
      )}
      {result === "reject" && (
        <Alert severity={finalRound ? "error" : "warning"} role="status">
          <AlertTitle sx={{ fontWeight: 500 }}>
            {finalRound ? "Requisition rejected after round 3." : `Returned to ${r.hm_name} for revision (round ${round + 1} of 3 follows).`}
          </AlertTitle>
          {finalRound
            ? "Sent to Opus. Flow 1 ended as Rejected; the hiring manager was notified and can copy it to a new requisition. "
            : 'Sent to Opus with your comments. The hiring manager gets a "Revise JD" task. '}
          <NextLink href="/tasks">Next task</NextLink>
        </Alert>
      )}
      {result && !["approve", "reject"].includes(result) && <Alert severity="success">Completed {formatMyt(task.completed_at, "full")}.</Alert>}
      {state.kind === "closed" && <ClosedBanner reqId={r.id} />}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.4fr) minmax(0, 1fr)" }, gap: 3, alignItems: "start" }}>
        <SectionCard title="Job description" source={<Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}>{edited ? "Edited by you" : "Unchanged"}</Typography>}>
          <CardContent>
            <Typography color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>
              Edit any section if needed. Edits are sent to Opus and published as-is. Title, store and salary come from the requisition.
            </Typography>
            <JdSectionsEditor
              idPrefix="h"
              value={jd}
              disabled={!open}
              onChange={(v) => {
                setJd(v);
                setEdited(true);
              }}
              howToApply={jdIn.how_to_apply}
            />
          </CardContent>
        </SectionCard>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, minWidth: 0 }}>
          <SectionCard
            title="AI pre-check"
            actions={<StatusChip tone={passed === checks ? "live" : "esc"} label={`${passed === checks ? "Passed" : "Issues"} · ${passed} of ${checks}`} />}
          >
            <CardContent sx={{ py: 1 }}>
              <FindingList findings={findings} />
            </CardContent>
          </SectionCard>

          <SectionCard title="Requisition">
            <CardContent>
              <KeyValues
                items={[
                  ["Department", r.department],
                  ["Role", r.role],
                  ["Openings", r.openings],
                  ["Base range", range(r.base_min, r.base_max)],
                  ["Store", r.store],
                  ["Region", r.region],
                  ["Hiring manager", r.hm_name],
                  ["Target start", formatMyt(`${r.target_start}T00:00:00+08:00`, "date")],
                ]}
              />
            </CardContent>
          </SectionCard>

          {open && (
            <SectionCard title="Your decision" source={<DataSourceBadge kind="task">Off-Platform callback · decision, edited_jd, hr_comments</DataSourceBadge>}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <RadioGroup
                  aria-label="Decision"
                  value={decision}
                  onChange={(e) => {
                    setDecision(e.target.value as "approve" | "reject");
                    setDecisionErr(undefined);
                  }}
                  sx={{ gap: 1 }}
                >
                  {[
                    { v: "approve", t: "Approve", d: "Create the job posting and mark JD live", c: "success.main" },
                    {
                      v: "reject",
                      t: returnLabel,
                      d: finalRound ? "Round 3 is the last round: this closes the requisition as Rejected. Comment required." : `They revise; round ${round + 1} of 3 follows. In round 3 this becomes "Reject requisition" and closes it.`,
                      c: "error.main",
                    },
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
                {decisionErr && (
                  <Typography color="error" role="alert" sx={{ fontSize: 13 }}>
                    {decisionErr}
                  </Typography>
                )}
                <TextField
                  id="cm"
                  label={decision === "reject" ? (finalRound ? "Reason for rejection (required)" : "Comments for the hiring manager (required)") : "Comments (optional)"}
                  multiline
                  minRows={3}
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    setCommentErr(undefined);
                  }}
                  placeholder="e.g. Please add the shift pattern and remove the second benefits line."
                  error={!!commentErr}
                  helperText={commentErr}
                  required={decision === "reject"}
                />
                {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end" }}>
                  <Button variant="outlined" component={Link} href="/tasks">
                    Back
                  </Button>
                  <Button variant="contained" onClick={submit} disabled={state.kind === "busy"}>
                    Send decision to Opus
                  </Button>
                </Box>
              </CardContent>
            </SectionCard>
          )}
        </Box>
      </Box>
    </>
  );
}
