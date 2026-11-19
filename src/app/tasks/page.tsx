"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Box, Button, Card, Tab, Tabs, Typography } from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import EditIcon from "@mui/icons-material/Edit";
import WarningIcon from "@mui/icons-material/Warning";
import CheckIcon from "@mui/icons-material/Check";
import { api, ApiClientError } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { DataSourceBadge, ErrorNote, Loading, PageHeader, StatusChip } from "@/components/ui";
import type { ChipTone } from "@/lib/format";
import { formatMyt, sinceMyt } from "@/lib/format";
import { taskChip, taskWhere } from "@/lib/tasks";

interface Row {
  key: string;
  icon: "hr" | "hm" | "esc" | "done";
  title: string;
  req: string;
  where: string;
  when: string;
  chip: { tone: ChipTone; label: string };
  action: string;
  href?: string;
  onClick?: () => void;
  primary: boolean;
}

const ICONS = {
  hr: { el: <AssignmentIcon />, light: ["#fff3e0", "#ef6c00"], dark: ["rgba(255,167,38,.16)", "#ffb74d"] },
  hm: { el: <EditIcon />, light: ["#fce4ec", "#c2185b"], dark: ["rgba(240,98,146,.16)", "#f48fb1"] },
  esc: { el: <WarningIcon />, light: ["#ffebee", "#c62828"], dark: ["rgba(244,67,54,.16)", "#ef9a9a"] },
  done: { el: <CheckIcon />, light: ["#e8f5e9", "#2e7d32"], dark: ["rgba(102,187,106,.16)", "#81c784"] },
};

export default function TasksPage() {
  const { user, bump } = useSession();
  const router = useRouter();
  const [view, setView] = useState(0);
  const [err, setErr] = useState<string>();
  const tasks = useApi(() => api.tasks.list("all"), [], { pollMs: 5000 });
  const reqs = useApi(() => api.requisitions.list(), [], { pollMs: 5000 });

  if (user.role === "HR_ADMIN") {
    return (
      <>
        <PageHeader title="My tasks" />
        <Alert severity="info">HR admin has no workflow tasks. Switch to the HR recruiter or a hiring manager in the user menu.</Alert>
      </>
    );
  }
  if (tasks.error) return <ErrorNote error={tasks.error} />;
  if (!tasks.data || !reqs.data) return <Loading />;

  const byId = new Map(reqs.data.map((r) => [r.id, r]));
  const toRow = (t: (typeof tasks.data)[number]): Row => {
    const r = byId.get(t.requisition_id);
    const open = t.status === "open";
    return {
      key: t.id,
      icon: !open ? "done" : t.task_type === "HM_JD_REVISE" ? "hm" : "hr",
      title: t.title,
      req: t.requisition_id,
      where: r ? taskWhere(t, r) : "",
      when: open
        ? t.task_type === "HM_JD_REVISE"
          ? `Returned ${sinceMyt(t.created_at)}${t.inputs.returned_by ? ` by ${String(t.inputs.returned_by)}` : ""}`
          : `Waiting since ${sinceMyt(t.created_at)}${t.reminders.length ? ` · reminder sent ${formatMyt(t.reminders[t.reminders.length - 1])}` : ""}`
        : t.status === "closed"
          ? "Closed in Opus (callback 401)"
          : `Completed ${formatMyt(t.completed_at, "full")}`,
      chip: taskChip(t),
      action: open ? (t.task_type === "HM_JD_REVISE" ? "Revise" : "Review") : "View",
      href: open ? `/tasks/${t.id}` : `/tasks/${t.id}`,
      primary: open,
    };
  };

  const openRows = tasks.data.filter((t) => t.status === "open").map(toRow);
  const doneRows = tasks.data.filter((t) => t.status !== "open").map(toRow);

  if (user.role === "HIRING_MANAGER") {
    // Rejected notices: not Opus tasks, built from Opus results (job ended Rejected).
    const rejected = reqs.data.filter((r) => r.status === "Rejected" && r.hm_user === user.id);
    for (const r of rejected) {
      doneRows.unshift({
        key: `rej-${r.id}`,
        icon: "esc",
        title: `Requisition rejected after round 3 · ${r.role}`,
        req: r.id,
        where: r.store,
        when: `Closed ${formatMyt(r.completed_at, "full")} · reasons from all 3 rounds sent to you`,
        chip: { tone: "esc", label: "Rejected" },
        action: "Copy to new",
        primary: false,
        onClick: async () => {
          try {
            const n = await api.requisitions.copy(r.id);
            bump();
            router.push(`/requisitions/new?draft=${n.id}`);
          } catch (e) {
            setErr((e as ApiClientError).message);
          }
        },
      });
    }
  }

  const list = view === 0 ? openRows : doneRows;
  const intro =
    user.role === "HR_RECRUITER"
      ? "Steps Opus has paused on: JD verifications and shortlist reviews. Your decision goes straight back to the workflow."
      : "JDs returned to you for changes, and rejected requisitions you can copy to a new one.";

  return (
    <>
      <PageHeader title="My tasks" subtitle={intro} />
      {err && <Alert severity="error">{err}</Alert>}
      <Card component="section" aria-label="Tasks">
        <Tabs value={view} onChange={(_, v: number) => setView(v)} aria-label="Task status" sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab label={`Open (${openRows.length})`} id="tasks-tab-0" aria-controls="tasks-panel" />
          <Tab label="Completed" id="tasks-tab-1" aria-controls="tasks-panel" />
        </Tabs>
        <Box id="tasks-panel" role="tabpanel" aria-labelledby={`tasks-tab-${view}`}>
          {list.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              Nothing here.
            </Typography>
          )}
          {list.map((t) => (
            <Box key={t.key} sx={{ display: "grid", gridTemplateColumns: { xs: "auto 1fr", sm: "auto minmax(0,1fr) auto auto" }, gap: "8px 16px", alignItems: "center", px: 2, py: 1.75, borderBottom: 1, borderColor: "divider" }}>
              <Box
                aria-hidden
                sx={(theme) => ({
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: ICONS[t.icon].light[0],
                  color: ICONS[t.icon].light[1],
                  ...theme.applyStyles("dark", { bgcolor: ICONS[t.icon].dark[0], color: ICONS[t.icon].dark[1] }),
                })}
              >
                {ICONS[t.icon].el}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500 }}>{t.title}</Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {t.req} · {t.where}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {t.when}
                </Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: "2", sm: "auto" } }}>
                <StatusChip tone={t.chip.tone} label={t.chip.label} />
              </Box>
              <Box sx={{ gridColumn: { xs: "2", sm: "auto" } }}>
                {t.href ? (
                  <Button variant={t.primary ? "contained" : "outlined"} component={Link} href={t.href} aria-label={`${t.action}: ${t.title}, ${t.req}`}>
                    {t.action}
                  </Button>
                ) : (
                  <Button variant="outlined" onClick={t.onClick} aria-label={`${t.action}: ${t.req}`}>
                    {t.action}
                  </Button>
                )}
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1.5 }}>
          <DataSourceBadge kind="task">Opus task payload · stored when Opus paused at the Off-Platform node</DataSourceBadge>
          <DataSourceBadge kind="app">App store · assignee, status, reminders</DataSourceBadge>
          <DataSourceBadge kind="aud">Opus results · rejected jobs (notice only, not a task)</DataSourceBadge>
        </Box>
      </Card>
    </>
  );
}
