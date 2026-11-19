"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import type { Band } from "@/domain/types";
import { api } from "@/lib/api";
import { useApi, useSession } from "./SessionProvider";
import { DataSourceBadge, ErrorNote, FlowStepper, Loading, PageHeader, ScoreBar, SectionCard, StatusChip, TableScroll } from "./ui";
import { BAND_LABEL, BAND_TONE, CAND_STATUS_LABEL, CAND_STATUS_TONE, formatMyt } from "@/lib/format";
import { flow1bSteps } from "@/lib/steps";

/** Screen 9: Candidates & shortlist (Flow 1b). `reqId` comes from the route, or is chosen in the selector. */
export function CandidatesView({ reqId }: { reqId?: string }) {
  const router = useRouter();
  const { user } = useSession();
  const [band, setBand] = useState<"all" | Band>("all");
  const reqs = useApi(() => api.requisitions.list(), [], { pollMs: 5000 });
  const choices = (reqs.data ?? []).filter((r) => r.status === "Live" || r.shortlist);
  const currentId = reqId ?? choices.find((r) => r.shortlist)?.id ?? choices[0]?.id;
  const cands = useApi(() => (currentId ? api.requisitions.candidates(currentId) : Promise.resolve([])), [currentId], { pollMs: 5000 });

  if (user.role === "HIRING_MANAGER") {
    return (
      <>
        <PageHeader title="Candidates" />
        <Alert severity="info">Candidates and the shortlist are handled by HR. Switch to the HR recruiter in the user menu.</Alert>
      </>
    );
  }
  if (reqs.error) return <ErrorNote error={reqs.error} />;
  if (!reqs.data) return <Loading />;
  const r = reqs.data.find((x) => x.id === currentId);
  if (!r) {
    return (
      <>
        <PageHeader title="Candidates" />
        <Alert severity="info">No requisition with a live JD yet.</Alert>
      </>
    );
  }
  const list = cands.data ?? [];
  const sl = r.shortlist;
  const rows = band === "all" ? list : list.filter((c) => c.band === band);
  const statusChip = !sl
    ? { tone: "ai" as const, label: "Screening open" }
    : sl.status === "Complete"
      ? { tone: "live" as const, label: `Shortlist complete · ${sl.counts.hi + (sl.selected ?? 0)} in Flow 2a` }
      : { tone: "hr" as const, label: "Waiting for HR review" };

  const selector = (
    <TextField
      select
      size="small"
      label="Requisition"
      value={r.id}
      onChange={(e) => router.push(`/requisitions/${e.target.value}/candidates`)}
      sx={{ minWidth: 280 }}
    >
      {choices.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.id} · {c.role} · {c.store}
          {!c.shortlist ? " (screening open)" : ""}
        </MenuItem>
      ))}
    </TextField>
  );

  const bandCard = (b: Band, title: string, sub: React.ReactNode, color: string, action?: React.ReactNode) => (
    <Card sx={{ borderTop: `4px solid ${color}`, p: 2, display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
        {BAND_LABEL[b] === "90%+" ? "90% or more" : BAND_LABEL[b]}
      </Typography>
      <Typography sx={{ fontSize: 34, lineHeight: 1 }}>{sl?.counts[b] ?? 0}</Typography>
      <Typography sx={{ fontWeight: 500 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
        {sub}
      </Typography>
      {action}
    </Card>
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Requisitions", href: "/requisitions" }, { label: r.id, href: `/requisitions/${r.id}` }, { label: "Candidates" }]}
        title={`Candidates · ${r.role}, ${r.store}`}
        chips={<StatusChip tone={statusChip.tone} label={statusChip.label} />}
        subtitle={
          sl
            ? `KitaHQ screening closed ${formatMyt(sl.closed_at, "full")} · ${list.length} applicants scored · ${r.openings} openings · Flow 1b job ${sl.job_id.split("-").slice(0, 2).join("-")}`
            : `KitaHQ screening open · ${r.openings} openings`
        }
        actions={selector}
      />

      <SectionCard title="Flow 1b progress" source={<DataSourceBadge kind="aud">Opus audit · Flow 1b nodes</DataSourceBadge>}>
        <FlowStepper label="Flow 1b progress" steps={flow1bSteps(r, list.length)} />
      </SectionCard>

      {!sl ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" component={Link} href="/demo">
              Presenter panel
            </Button>
          }
        >
          KitaHQ screening is still open for {r.id}. Flow 1b starts when it closes (in the demo: Presenter panel → Close KitaHQ screening).
        </Alert>
      ) : (
        <>
          <Box component="section" aria-label="Score bands" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
            {bandCard("hi", "Shortlisted automatically", `Shortlisted email sent ${formatMyt(sl.emails_at)} · Flow 2a started for each`, "#66bb6a")}
            {bandCard(
              "mid",
              "HR review",
              sl.status === "Complete"
                ? sl.counts.mid
                  ? `${sl.selected ?? 0} selected (shortlisted email sent) · ${sl.counts.mid - (sl.selected ?? 0)} not selected (regret email sent)`
                  : "Band empty: HR review skipped"
                : `Waiting for HR review · task with ${sl.review_by ?? "HR"}`,
              "#ffa726",
              sl.status !== "Complete" && sl.review_task_id ? (
                <Box>
                  <Button variant="contained" component={Link} href={`/tasks/${sl.review_task_id}`}>
                    Open review task
                  </Button>
                </Box>
              ) : undefined,
            )}
            {bandCard("lo", "Not shortlisted", `Regret email sent ${formatMyt(sl.emails_at)}`, "#ef5350")}
          </Box>

          <Card component="section" aria-label="Candidate list">
            <Box role="group" aria-label="Filter by score band" sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 2, borderBottom: 1, borderColor: "divider" }}>
              {(["all", "hi", "mid", "lo"] as const).map((k) => {
                const n = k === "all" ? list.length : list.filter((c) => c.band === k).length;
                const s = band === k;
                return <Chip key={k} label={`${k === "all" ? "All" : BAND_LABEL[k]} (${n})`} clickable color={s ? "primary" : "default"} variant={s ? "filled" : "outlined"} aria-pressed={s} onClick={() => setBand(k)} />;
              })}
            </Box>
            {cands.error ? (
              <ErrorNote error={cands.error} />
            ) : (
              <TableScroll label="Candidates table">
                <Table size="small" sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      {["Candidate", "KitaHQ score", "Band", "Status", "Interview note (KitaHQ)"].map((h) => (
                        <TableCell key={h} scope="col">
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>
                          <Typography sx={{ fontWeight: 500, fontSize: 14 }}>
                            {c.name}
                            {c.rehire ? " · Rehire" : ""}
                          </Typography>
                          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                            {c.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <ScoreBar score={c.kitahq_score} />
                        </TableCell>
                        <TableCell>
                          <StatusChip tone={BAND_TONE[c.band]} label={BAND_LABEL[c.band]} />
                        </TableCell>
                        <TableCell>
                          <StatusChip tone={CAND_STATUS_TONE[c.status]} label={CAND_STATUS_LABEL[c.status]} />
                          <Typography color="text.secondary" sx={{ fontSize: 12.5, mt: 0.5 }}>
                            {c.status === "AwaitingHrReview"
                              ? `Task with ${sl.review_by ?? "HR"} since ${formatMyt(c.status_at, "time")}`
                              : c.flow2a_started
                                ? `${c.shortlist_source === "auto" ? "Auto · " : ""}email sent ${formatMyt(c.status_at)} · Flow 2a started`
                                : `Regret sent ${formatMyt(c.status_at)}`}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>{c.kitahq_note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableScroll>
            )}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1.5 }}>
              <DataSourceBadge kind="app">App store · candidates, status, Flow 2a job IDs</DataSourceBadge>
              <DataSourceBadge kind="aud">Opus results · bands, emails sent</DataSourceBadge>
            </Box>
          </Card>
        </>
      )}
    </>
  );
}
