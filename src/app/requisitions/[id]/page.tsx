"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import {
  DataSourceBadge,
  ErrorNote,
  FindingList,
  FlowStepper,
  KeyValues,
  Loading,
  NextLink,
  PageHeader,
  SectionCard,
  StatusChip,
  TableScroll,
} from "@/components/ui";
import { JdText, JobPostPreview } from "@/components/JdPreview";
import { STATUS_LABEL, STATUS_TONE, formatMyt, range } from "@/lib/format";
import { flow1Steps } from "@/lib/steps";

const TABS = ["Overview", "JD & versions", "Review history", "Job posting", "Activity"];
const BUSY = ["Submitted", "AiPrecheck", "JobPosting"];

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const [tab, setTab] = useState(0);
  const req = useApi(() => api.requisitions.get(id), [id], { pollMs: 2500 });
  const tasks = useApi(() => api.tasks.list("open"), [id], { pollMs: 5000 });

  if (req.error) return <ErrorNote error={req.error} />;
  if (!req.data) return <Loading />;
  const r = req.data;
  const myTask = tasks.data?.find((t) => t.requisition_id === r.id);
  const published = [...r.versions].reverse().find((v) => v.published) ?? r.versions[r.versions.length - 1];
  const isMine = user.role === "HIRING_MANAGER" && r.hm_user === user.id;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Requisitions", href: "/requisitions" }, { label: r.id }]}
        title={`${r.role || "New requisition"} · ${r.store || "–"}`}
        chips={<StatusChip tone={STATUS_TONE[r.status]} label={r.status === "WithHr" || r.status === "ReturnedToHm" ? `${STATUS_LABEL[r.status]} · round ${r.round}` : STATUS_LABEL[r.status]} />}
        subtitle={
          <>
            {r.id} · Hiring manager {r.hm_name}
            {r.opus_job_ids.flow1 && ` · Opus job ${r.opus_job_ids.flow1.split("-").slice(0, 2).join("-")} (Flow 1)`}
            {r.completed_at && ` · ${r.status === "Rejected" ? "closed" : "completed"} ${formatMyt(r.completed_at, "full")}`}
          </>
        }
        actions={
          <>
            {myTask && (
              <Button variant="contained" component={Link} href={`/tasks/${myTask.id}`}>
                {myTask.task_type === "HM_JD_REVISE" ? "Revise JD" : "Open task"}
              </Button>
            )}
            {isMine && r.status === "Rejected" && (
              <Button variant="outlined" startIcon={<ContentCopyIcon />} component={Link} href={`/requisitions/new?copy=${r.id}`}>
                Copy to new requisition
              </Button>
            )}
          </>
        }
      />
      {BUSY.includes(r.status) && (
        <Alert severity="info" role="status">
          {r.status === "JobPosting" ? "Opus is generating the job posting (demo: LinkedIn-style PDF)…" : "Opus is running the AI pre-check. This page refreshes by itself."}
        </Alert>
      )}
      {r.status === "Rejected" && (
        <Alert severity="error">
          Not approved after round 3. Nothing was posted; the hiring manager and HR were notified with all findings and comments.
          {isMine ? " Use \"Copy to new requisition\" to start again with 3 fresh rounds." : ""}
        </Alert>
      )}

      <SectionCard title="Flow 1 progress" source={<DataSourceBadge kind="aud">Opus audit · executed_nodes / running_node → stage labels</DataSourceBadge>}>
        <FlowStepper label="Flow 1 progress" steps={flow1Steps(r)} />
      </SectionCard>

      <Card component="section" aria-label="Requisition sections">
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="Requisition sections" sx={{ borderBottom: 1, borderColor: "divider" }}>
          {TABS.map((t, i) => (
            <Tab key={t} label={t} id={`req-tab-${i}`} aria-controls={`req-panel-${i}`} />
          ))}
        </Tabs>
        <Box role="tabpanel" id={`req-panel-${tab}`} aria-labelledby={`req-tab-${tab}`} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          {tab === 0 && (
            <>
              <KeyValues
                items={[
                  ["Requisition ID", r.id],
                  ["Department", r.department || "–"],
                  ["Role", r.role || "–"],
                  ["Store", r.store || "–"],
                  ["Region", r.region || "–"],
                  ["Openings", r.openings],
                  ["Base salary range", r.base_min ? `${range(r.base_min, r.base_max)} / month` : "–"],
                  ["Employment type", r.employment_type],
                  ["Target start", r.target_start ? formatMyt(`${r.target_start}T00:00:00+08:00`, "date") : "–"],
                  ["Hiring manager", r.hm_name],
                  ["HR verifier", r.hr_name ?? "–"],
                  ["Review rounds used", `${r.round} of 3`],
                  ["JD template", r.template_version],
                  ["Opus job ID (Flow 1)", <Box component="span" key="j" sx={{ fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}>{r.opus_job_ids.flow1 ?? "–"}</Box>],
                  ...(r.copied_from ? ([["Copied from", <NextLink key="c" href={`/requisitions/${r.copied_from}`}>{r.copied_from}</NextLink>]] as [string, React.ReactNode][]) : []),
                ]}
              />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <DataSourceBadge kind="app">App store · ID, role, store, openings, range, job ID</DataSourceBadge>
                <DataSourceBadge kind="mst">Master data · region</DataSourceBadge>
                <DataSourceBadge kind="dir">Directory · HM, HR verifier</DataSourceBadge>
                <DataSourceBadge kind="aud">Opus audit · rounds used</DataSourceBadge>
              </Box>
              {r.status === "Live" && user.role !== "HIRING_MANAGER" && (
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {r.shortlist ? (
                    <>
                      KitaHQ screening closed {formatMyt(r.shortlist.closed_at, "full")}. Flow 1b (Shortlist) {r.shortlist.status === "Complete" ? "has finished" : "is running"} for this requisition:{" "}
                      <NextLink href={`/requisitions/${r.id}/candidates`}>view candidates</NextLink>.
                    </>
                  ) : (
                    <>
                      KitaHQ screening is open. Flow 1b (Shortlist) starts when it closes (demo: <NextLink href="/demo">Presenter panel</NextLink>).
                    </>
                  )}
                </Typography>
              )}
            </>
          )}

          {tab === 1 && (
            <>
              {r.versions.length === 0 ? (
                <Typography color="text.secondary">No versions yet.</Typography>
              ) : (
                <TableScroll label="JD versions">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {["Version", "By", "When (MYT)", "Change"].map((h) => (
                          <TableCell key={h} scope="col">
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {r.versions.map((v) => (
                        <TableRow key={v.version}>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            v{v.version}
                            {v === published && v.published ? " · published" : ""}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            {v.by} ({v.by_role})
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{formatMyt(v.at)}</TableCell>
                          <TableCell>{v.change}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              )}
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                {published?.published ? `Published version (v${published.version}), by section.` : "Current version, by section."} Title, store and salary are added to each posting from the requisition fields.
              </Typography>
              <JdText jd={published?.sections ?? r.jd_sections} />
            </>
          )}

          {tab === 2 &&
            (r.reviews.length === 0 ? (
              <Typography color="text.secondary">No review rounds yet.</Typography>
            ) : (
              r.reviews.map((rv) => {
                const chip =
                  rv.outcome === "approved"
                    ? { tone: "live" as const, label: rv.hr?.edited ? "Approved with edits" : "Approved" }
                    : rv.outcome === "returned"
                      ? { tone: "ret" as const, label: "Returned to HM" }
                      : rv.outcome === "rejected"
                        ? { tone: "esc" as const, label: "Rejected" }
                        : { tone: "hr" as const, label: rv.precheck ? "With HR" : "AI pre-check running" };
                return (
                  <Box key={rv.round} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1 }}>
                      <Typography component="h3" sx={{ fontWeight: 500 }}>
                        Round {rv.round} · AI pre-check{rv.hr ? " + HR verification" : ""}
                      </Typography>
                      <StatusChip tone={chip.tone} label={chip.label} />
                      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                        {formatMyt(rv.hr?.at ?? rv.precheck?.at)}
                      </Typography>
                    </Box>
                    {rv.precheck && <FindingList findings={rv.precheck.findings} />}
                    {rv.hr && (
                      <Typography sx={{ mt: 1, fontSize: 14 }}>
                        <b>HR ({rv.hr.by}):</b> {rv.hr.decision === "approve" ? "Approved" : r.status === "Rejected" && rv.round === 3 ? "Rejected" : "Returned"}
                        {rv.hr.comments ? ` · "${rv.hr.comments}"` : ""}
                      </Typography>
                    )}
                    {rv.hm && (
                      <Typography sx={{ mt: 1, fontSize: 14 }} color="text.secondary">
                        HM ({rv.hm.by}) resubmitted {formatMyt(rv.hm.at)}
                        {rv.hm.note ? ` · "${rv.hm.note}"` : ""}
                      </Typography>
                    )}
                  </Box>
                );
              })
            ))}

          {tab === 3 &&
            (r.posting ? (
              <>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", justifyContent: "space-between" }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <StatusChip tone="live" label="JD live" />
                    <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                      Job posting generated {formatMyt(r.posting.generated_at, "full")}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Button variant="outlined" startIcon={<OpenInNewIcon />} href={api.requisitions.postingPdfUrl(r.id)} target="_blank" rel="noopener">
                      Open PDF
                    </Button>
                    <Button variant="outlined" startIcon={<DownloadIcon />} href={api.requisitions.postingPdfUrl(r.id, true)}>
                      Download
                    </Button>
                  </Box>
                </Box>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  Demo: instead of posting to LinkedIn, Indeed, JobStreet and Valiram Careers, Opus generates this job post as a PDF (LinkedIn-style layout). Real site posting comes after the demo.
                </Typography>
                <JobPostPreview r={r} />
                <Accordion disableGutters sx={{ maxWidth: 820 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>Show the generated PDF</AccordionSummary>
                  <AccordionDetails>
                    <Box component="iframe" title={`Job post PDF for ${r.id}`} src={api.requisitions.postingPdfUrl(r.id)} sx={{ width: "100%", height: 720, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "#fff" }} />
                  </AccordionDetails>
                </Accordion>
                <DataSourceBadge kind="aud">Opus results · job posting step output (file: job_post.pdf)</DataSourceBadge>
              </>
            ) : (
              <Typography color="text.secondary">
                {r.status === "JobPosting" ? "Opus is generating the job posting…" : r.status === "Rejected" ? "Nothing was posted: the requisition was rejected." : "The job posting is created after HR approves the JD."}
              </Typography>
            ))}

          {tab === 4 && (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {[...r.activity].reverse().map((a, i) => (
                <Box component="li" key={i} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "150px 1fr" }, gap: { xs: 0, sm: 2 }, py: 1, borderBottom: 1, borderColor: "divider", fontSize: 14 }}>
                  <Typography component="time" dateTime={a.at} color="text.secondary" sx={{ fontSize: 13 }}>
                    {formatMyt(a.at)} MYT
                  </Typography>
                  <span>{a.text}</span>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Card>
    </>
  );
}
