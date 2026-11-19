"use client";
import { useState } from "react";
import { Alert, Box, Button, Card, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import type { Settings } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { DataSourceBadge, ErrorNote, Loading, PageHeader, TableScroll } from "@/components/ui";

const TABS = ["Stores & regions", "Departments & roles", "Shortlist rules", "JD template", "Users & roles", "Connections", "Opus step mapping"];

function Tbc({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({ display: "inline-block", fontSize: 11.5, px: 0.75, borderRadius: 1, border: "1px dashed #f9a825", bgcolor: "#fffde7", color: "#8d6e00", ml: 0.5, ...theme.applyStyles("dark", { bgcolor: "rgba(255,213,79,.12)", color: "#ffe082", borderColor: "#ffd54f" }) })}
    >
      {children}
    </Box>
  );
}

function Grid({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <TableScroll>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            {head.map((h) => (
              <TableCell key={h} scope="col">
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => (
                <TableCell key={j}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}

export default function SettingsPage() {
  const { user } = useSession();
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const settings = useApi(() => api.settings.get(), []);
  const [rules, setRules] = useState<{ auto: string; review: string } | null>(null);
  const [howTo, setHowTo] = useState<string | null>(null);

  if (settings.error) return <ErrorNote error={settings.error} />;
  if (!settings.data) return <Loading />;
  const s = settings.data;
  const admin = user.role === "HR_ADMIN";

  const save = async (patch: Parameters<typeof api.settings.update>[0]) => {
    setMsg(undefined);
    try {
      await api.settings.update(patch);
      await settings.reload();
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as ApiClientError).message });
    }
  };
  const toggle = <K extends "stores" | "departments">(key: K, id: string) => {
    const list = (s[key] as Settings[K]).map((x) => (x.id === id ? { ...x, active: !x.active } : x));
    void save({ [key]: list } as Partial<Settings>);
  };
  const sw = (on: boolean, label: string, onChange?: () => void) => (
    <Switch checked={on} onChange={onChange} disabled={!admin || !onChange} slotProps={{ input: { "aria-label": label } }} />
  );
  const head = (text: React.ReactNode, extra?: React.ReactNode) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", justifyContent: "space-between", mb: 2 }}>
      <Typography color="text.secondary" sx={{ fontSize: 13, flex: "1 1 320px" }}>
        {text}
      </Typography>
      {extra}
    </Box>
  );

  const r = rules ?? { auto: String(s.rules.auto_min), review: String(s.rules.review_min) };

  return (
    <>
      <PageHeader title="Settings" subtitle="Reference data and connections the Flow 1 and Flow 1b screens depend on." />
      {!admin && <Alert severity="info">Read-only. Only HR admin (Aaron Wong) can change settings: switch role in the user menu.</Alert>}
      {msg && <Alert severity={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Card component="section" aria-label="Settings sections">
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="Settings sections" sx={{ borderBottom: 1, borderColor: "divider" }}>
          {TABS.map((t, i) => (
            <Tab key={t} label={t} id={`set-tab-${i}`} aria-controls={`set-panel-${i}`} />
          ))}
        </Tabs>
        <Box role="tabpanel" id={`set-panel-${tab}`} aria-labelledby={`set-tab-${tab}`} sx={{ p: 2 }}>
          {tab === 0 && (
            <>
              {head(<>Used by the New requisition form and the AI pre-check (region check). Source <Tbc>TBC: sheet, Ramco or kept here</Tbc></>, <DataSourceBadge kind="mst">Master data</DataSourceBadge>)}
              <Grid head={["Store", "Region", "Store manager", "Active"]} rows={s.stores.map((x) => [x.name, x.region, x.manager, sw(x.active, `${x.name} active`, () => toggle("stores", x.id))])} />
            </>
          )}
          {tab === 1 && (
            <>
              {head(<>Every requisition must have a department; the role list on the New requisition form shows only roles under that department. Source <Tbc>TBC: HR org chart or Ramco</Tbc></>)}
              <Grid head={["Department", "Roles", "JD template", "Active"]} rows={s.departments.map((d) => [d.name, d.roles.join(", "), d.template, sw(d.active, `${d.name} active`, () => toggle("departments", d.id))])} />
            </>
          )}
          {tab === 2 && (
            <>
              {head("Flow 1b score bands. They are sent to Flow 1b as inputs, so changing them needs no workflow change.")}
              <Grid
                head={["Band", "KitaHQ score", "What happens", "Email"]}
                rows={[
                  ["Auto-shortlist", `${s.rules.auto_min}% or more`, "Shortlisted email; Flow 2a starts", `Shortlisted: "${s.rules.shortlisted_email}"`],
                  ["HR review", `${s.rules.review_min}% – ${s.rules.auto_min - 1}%`, "HR selects in the app. Selected: shortlisted email and Flow 2a. Not selected: regret email", "Shortlisted / Regret"],
                  ["Regret", `Below ${s.rules.review_min}%`, "Regret email; no further steps", `Regret: "${s.rules.regret_email}"`],
                ]}
              />
              {admin && (
                <Box component="form" onSubmit={(e) => { e.preventDefault(); void save({ rules: { ...s.rules, auto_min: Number(r.auto), review_min: Number(r.review) } }); }} sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2, alignItems: "center" }}>
                  <TextField size="small" type="number" label="Auto-shortlist from (%)" value={r.auto} onChange={(e) => setRules({ ...r, auto: e.target.value })} />
                  <TextField size="small" type="number" label="HR review from (%)" value={r.review} onChange={(e) => setRules({ ...r, review: e.target.value })} />
                  <Button type="submit" variant="outlined">
                    Save thresholds
                  </Button>
                </Box>
              )}
              <Typography color="text.secondary" sx={{ fontSize: 13, mt: 1.5 }}>
                Open points <Tbc>TBC</Tbc>: maximum shortlisted per requisition (no cap today), score rounding, sender address, email language (English / BM).
              </Typography>
            </>
          )}
          {tab === 3 && (
            <>
              {head(<>Each section becomes a box on the New requisition form. Title, store, salary and employment type are form fields, not sections. The list is sent to Flow 1, so the AI pre-check checks the same sections. <Tbc>Valiram template TBC</Tbc></>)}
              <Grid head={["Section", "Shown to HM as", "Required", "Pre-check rule"]} rows={s.template.sections.map((x) => [x.label, x.shown_as, sw(x.required, `${x.label} required`), x.rule])} />
              <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1, maxWidth: 640 }}>
                <TextField label="How to apply (fixed text)" multiline minRows={2} value={howTo ?? s.template.how_to_apply} onChange={(e) => setHowTo(e.target.value)} disabled={!admin} />
                {admin && (
                  <Box>
                    <Button variant="outlined" onClick={() => save({ how_to_apply: howTo ?? s.template.how_to_apply })}>
                      Save text
                    </Button>
                  </Box>
                )}
              </Box>
            </>
          )}
          {tab === 4 && (
            <>
              {head(<>People sign in with company SSO <Tbc>Entra ID or Google TBC</Tbc>. Roles decide menus and who gets which task. In the demo, the user menu switches between the first three.</>)}
              <Grid head={["Name", "Role", "Gets these tasks", "Scope"]} rows={s.users.map((u) => [u.name, u.title, u.tasks, u.scope])} />
            </>
          )}
          {tab === 5 && (
            <>
              {head("Connections are made in Opus; this page only shows their state.")}
              <Grid
                head={["Connection", "Used for", "Status"]}
                rows={s.connections.map((c) => [
                  c.name,
                  c.used_for,
                  <Box key="s" component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontWeight: 500, color: c.status === "ok" ? "success.main" : c.status === "warn" ? "warning.main" : "text.secondary" }}>
                    <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "currentColor" }} />
                    {c.status_text}
                    {c.note && (
                      <Typography component="span" color="text.secondary" sx={{ fontSize: 12, fontWeight: 400 }}>
                        {" "}
                        · {c.note}
                      </Typography>
                    )}
                  </Box>,
                ])}
              />
            </>
          )}
          {tab === 6 && (
            <>
              {head("Opus audit returns node IDs. This table turns them into the stage names users see. Update it when the workflow is republished.")}
              <Grid
                head={["Opus node", "Type", "Stage shown", "Round"]}
                rows={s.node_map.map((n) => [
                  <Box key="n" component="span" sx={{ fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}>
                    {n.node}
                  </Box>,
                  <>
                    {n.type}
                    {n.tbc && <Tbc>{n.tbc}</Tbc>}
                  </>,
                  n.stage,
                  n.round,
                ])}
              />
            </>
          )}
        </Box>
      </Card>
    </>
  );
}
