"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CardContent,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiClientError } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { ErrorNote, Loading, NextLink, PageHeader, SectionCard, StatusChip, TableScroll } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export default function DemoPage() {
  const { personas, switchUser, bump, user } = useSession();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [resendId, setResendId] = useState("");
  const state = useApi(() => api.demo.state(), [], { pollMs: 3000 });
  const reqs = useApi(() => api.requisitions.list(), [], { pollMs: 3000 });
  const tasks = useApi(() => api.tasks.list("done"), []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMsg(undefined);
    try {
      await fn();
      setMsg({ ok: true, text: label });
      bump();
    } catch (e) {
      setMsg({ ok: false, text: (e as ApiClientError).message });
    }
  };

  const go = (userId: string, href: string) => {
    switchUser(userId);
    router.push(href);
  };

  if (state.error) return <ErrorNote error={state.error} />;
  if (!state.data || !reqs.data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Presenter panel"
        subtitle="Demo controls for the Opus simulator. Not part of the real app."
        actions={
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (window.confirm("Reset all demo data to the starting state?")) void run("Demo data reset to the starting state.", () => api.demo.reset());
            }}
          >
            Reset demo data
          </Button>
        }
      />
      {msg && (
        <Alert severity={msg.ok ? "success" : "error"} role="status">
          {msg.text}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 3, alignItems: "start" }}>
        <SectionCard title="Simulator">
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography color="text.secondary" sx={{ fontSize: 13 }}>
              Data mode <b>{state.data.data_mode}</b> · simulated Opus step delay {state.data.sim_delay_ms} ms · {state.data.pending_events} step(s) pending
            </Typography>
            <Typography component="h3" sx={{ fontWeight: 500 }} id="pc-label">
              AI pre-check outcome
            </Typography>
            <RadioGroup aria-labelledby="pc-label" value={state.data.precheck_mode} onChange={(e) => void run(`Pre-check mode: ${e.target.value}`, () => api.demo.setPrecheck(e.target.value as "auto" | "pass" | "fail"))}>
              <FormControlLabel value="auto" control={<Radio />} label="Rule-based (real checks on the JD text)" />
              <FormControlLabel value="pass" control={<Radio />} label="Force pass" />
              <FormControlLabel value="fail" control={<Radio />} label="Force fail (returns to HM; rejected in round 3)" />
            </RadioGroup>
          </CardContent>
        </SectionCard>

        <SectionCard title="Act as">
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography color="text.secondary" sx={{ fontSize: 13 }}>
              Currently {user.name} ({user.title}). Jump straight to a role&apos;s screen:
            </Typography>
            {personas.map((p) => (
              <Box key={p.id} sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                <Typography sx={{ minWidth: 150, fontWeight: 500 }}>{p.name}</Typography>
                {p.role === "HR_RECRUITER" && (
                  <>
                    <Button size="small" variant="outlined" onClick={() => go(p.id, "/tasks")}>My tasks</Button>
                    <Button size="small" variant="outlined" onClick={() => go(p.id, "/candidates")}>Candidates</Button>
                  </>
                )}
                {p.role === "HIRING_MANAGER" && (
                  <>
                    <Button size="small" variant="outlined" onClick={() => go(p.id, "/requisitions/new")}>New requisition</Button>
                    <Button size="small" variant="outlined" onClick={() => go(p.id, "/tasks")}>My tasks</Button>
                  </>
                )}
                {p.role === "HR_ADMIN" && (
                  <Button size="small" variant="outlined" onClick={() => go(p.id, "/settings")}>Settings</Button>
                )}
              </Box>
            ))}
          </CardContent>
        </SectionCard>
      </Box>

      <SectionCard title="Requisitions">
        <TableScroll label="Demo requisition actions">
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                {["Requisition", "Store", "Stage", "Flow 1b", "Actions"].map((h) => (
                  <TableCell key={h} scope="col">
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {reqs.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <NextLink href={`/requisitions/${r.id}`}>{r.id}</NextLink>
                  </TableCell>
                  <TableCell>{r.store}</TableCell>
                  <TableCell>
                    <StatusChip tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
                  </TableCell>
                  <TableCell>{r.shortlist ? (r.shortlist.status === "Complete" ? "Complete" : "Waiting for HR review") : r.status === "Live" ? "Screening open" : "–"}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {r.status === "Live" && (
                      <Button size="small" variant="outlined" onClick={() => void run(`KitaHQ screening closed for ${r.id}: Flow 1b started.`, () => api.demo.closeScreening(r.id))}>
                        {r.shortlist ? "Re-run screening close" : "Close KitaHQ screening"}
                      </Button>
                    )}
                    {(r.status === "AiPrecheck" || r.status === "JobPosting") && (
                      <Button size="small" variant="outlined" onClick={() => void run(`Finished the pending ${r.status === "AiPrecheck" ? "AI pre-check" : "job posting"} for ${r.id}.`, () => api.demo.advance(r.id))}>
                        Finish {r.status === "AiPrecheck" ? "AI pre-check" : "job posting"} now
                      </Button>
                    )}
                    {r.shortlist && (
                      <Button size="small" component={Link} href={`/requisitions/${r.id}/candidates`} sx={{ ml: 1 }}>
                        Candidates
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </SectionCard>

      <SectionCard title="Off-Platform callback rules">
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            Re-send the callback for a task you already completed. The token is single-use, so Opus answers 401 and the app shows &quot;task closed&quot;.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
            <TextField select size="small" label="Completed task (current role)" value={resendId} onChange={(e) => setResendId(e.target.value)} sx={{ minWidth: 300 }}>
              {(tasks.data ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.id} · {t.requisition_id} · {t.title}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              disabled={!resendId}
              onClick={async () => {
                setMsg(undefined);
                try {
                  await api.tasks.complete(resendId, {});
                  setMsg({ ok: false, text: "Unexpected: Opus accepted the callback." });
                } catch (e) {
                  const err = e as ApiClientError;
                  setMsg({ ok: err.status === 401, text: `HTTP ${err.status}: ${err.message}` });
                }
              }}
            >
              Re-send callback
            </Button>
          </Box>
        </CardContent>
      </SectionCard>
    </>
  );
}
