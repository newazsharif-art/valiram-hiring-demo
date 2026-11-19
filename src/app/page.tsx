"use client";
import Link from "next/link";
import { Box, Button, Card, CardActionArea, Typography } from "@mui/material";
import { formatInTimeZone } from "date-fns-tz";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { DataSourceBadge, ErrorNote, Loading, NextLink, SectionCard, StatusChip } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, TZ, formatMyt, sinceMyt } from "@/lib/format";
import { taskChip, taskWhere } from "@/lib/tasks";

export default function HomePage() {
  const { user } = useSession();
  const reqs = useApi(() => api.requisitions.list(), [], { pollMs: 5000 });
  const tasks = useApi(() => api.tasks.list("open"), [], { pollMs: 5000 });

  if (reqs.error) return <ErrorNote error={reqs.error} />;
  if (!reqs.data || !tasks.data) return <Loading />;

  const all = reqs.data;
  const open = tasks.data;
  const byId = new Map(all.map((r) => [r.id, r]));
  const hour = Number(formatInTimeZone(new Date(), TZ, "H"));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const month = formatInTimeZone(new Date(), TZ, "yyyy-MM");
  const count = (...s: string[]) => all.filter((r) => s.includes(r.status)).length;
  const rejectedThisMonth = all.filter((r) => r.status === "Rejected" && r.completed_at && formatInTimeZone(new Date(r.completed_at), TZ, "yyyy-MM") === month).length;

  const stats: { n: number; label: string; href: string; color?: string; src: [("app" | "aud"), string] }[] = [
    ...(user.role !== "HR_ADMIN" ? [{ n: open.length, label: "Waiting for me", href: "/tasks", color: "error.main", src: ["app", "App store · open tasks"] as ["app", string] }] : []),
    { n: count("Submitted", "AiPrecheck"), label: "In AI pre-check", href: "/requisitions?status=ai", src: ["aud", "Opus audit"] },
    { n: count("WithHr"), label: "With HR (verification)", href: "/requisitions?status=hr", src: ["aud", "Opus audit"] },
    { n: count("ReturnedToHm"), label: "Returned to hiring manager", href: "/requisitions?status=ret", src: ["aud", "Opus audit"] },
    { n: rejectedThisMonth, label: "Rejected this month", href: "/requisitions?status=rej", src: ["aud", "Opus results"] },
    { n: count("Live", "JobPosting"), label: "JD live", href: "/requisitions?status=live", color: "success.main", src: ["app", "App store"] },
  ];

  const feed = all
    .flatMap((r) => r.activity.map((a) => ({ ...a, id: r.id })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  const mine = all.filter((r) => r.status !== "Rejected").slice(0, 5);

  return (
    <>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h1">
            {greet}, {user.name.split(" ")[0]}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {formatMyt(new Date().toISOString(), "long-date")}
            {user.role !== "HR_ADMIN" && ` · ${open.length} task${open.length === 1 ? " is" : "s are"} waiting for you`}
          </Typography>
        </Box>
        {user.role === "HIRING_MANAGER" ? (
          <Button variant="contained" component={Link} href="/requisitions/new">
            New requisition
          </Button>
        ) : user.role === "HR_RECRUITER" ? (
          <Button variant="contained" component={Link} href="/tasks">
            Open my tasks
          </Button>
        ) : (
          <Button variant="contained" component={Link} href="/settings">
            Open settings
          </Button>
        )}
      </Box>

      <Box component="section" aria-label="Requisitions by stage" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 2 }}>
        {stats.map((s) => (
          <Card key={s.label}>
            <CardActionArea component={Link} href={s.href} sx={{ p: 2, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.75, height: "100%" }}>
              <Typography sx={{ fontSize: 34, lineHeight: 1, color: s.color }}>{s.n}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                {s.label}
              </Typography>
              <DataSourceBadge kind={s.src[0]}>{s.src[1]}</DataSourceBadge>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 3, alignItems: "start" }}>
        {user.role !== "HR_ADMIN" && (
          <SectionCard title="Waiting for me" source={<DataSourceBadge kind="task">Opus task payload (stored by app)</DataSourceBadge>}>
            {open.length === 0 && <Typography sx={{ p: 2 }} color="text.secondary">Nothing waiting. Nice.</Typography>}
            {open.map((t) => {
              const r = byId.get(t.requisition_id);
              const chip = taskChip(t);
              return (
                <Box key={t.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
                  <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }}>{t.title}</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                      {t.requisition_id} · {r ? taskWhere(t, r) : ""}
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                      Waiting since {sinceMyt(t.created_at)}
                    </Typography>
                  </Box>
                  <StatusChip tone={chip.tone} label={chip.label} />
                  <Button variant="outlined" component={Link} href={`/tasks/${t.id}`} aria-label={`${t.task_type === "HM_JD_REVISE" ? "Revise" : "Review"}: ${t.title}, ${t.requisition_id}`}>
                    {t.task_type === "HM_JD_REVISE" ? "Revise" : "Review"}
                  </Button>
                </Box>
              );
            })}
            <Typography color="text.secondary" sx={{ px: 2, py: 1.5, fontSize: 13 }}>
              Opus is paused on these steps until you decide. Opus sets no deadline, so the app sends reminders after 1 working day.
            </Typography>
          </SectionCard>
        )}

        <SectionCard title="Recent activity" source={<DataSourceBadge kind="aud">Opus audit + time first seen by app</DataSourceBadge>}>
          <Box component="ul" sx={{ listStyle: "none", m: 0, py: 1, px: 0 }}>
            {feed.map((f, i) => (
              <Box component="li" key={i} sx={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 1.5, px: 2, py: 1, fontSize: 13.5 }}>
                <Typography component="time" dateTime={f.at} color="text.secondary" sx={{ fontSize: 12.5 }}>
                  {formatMyt(f.at, "feed")}
                </Typography>
                <span>
                  <NextLink href={`/requisitions/${f.id}`}>{f.id}</NextLink> {f.text}
                </span>
              </Box>
            ))}
          </Box>
        </SectionCard>
      </Box>

      <SectionCard
        title={user.role === "HIRING_MANAGER" ? "My requisitions" : "Open requisitions"}
        actions={
          <Button component={Link} href="/requisitions">
            View all
          </Button>
        }
      >
        {mine.length === 0 && <Typography sx={{ p: 2 }} color="text.secondary">No open requisitions.</Typography>}
        {mine.map((r) => (
          <Box key={r.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
            <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
              <NextLink href={`/requisitions/${r.id}`} sx={{ fontWeight: 500, textDecoration: "none" }}>
                {r.id} · {r.role}
              </NextLink>
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                {r.store} · {r.openings} openings · HM {r.hm_name}
              </Typography>
            </Box>
            <StatusChip tone={STATUS_TONE[r.status]} label={["WithHr", "ReturnedToHm"].includes(r.status) ? `${STATUS_LABEL[r.status]} · round ${r.round}` : STATUS_LABEL[r.status]} />
          </Box>
        ))}
      </SectionCard>
    </>
  );
}
