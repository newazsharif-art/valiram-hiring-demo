"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, Button, Card, Chip, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import type { RequisitionStatus } from "@/domain/types";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/components/SessionProvider";
import { DataSourceBadge, ErrorNote, Loading, NextLink, PageHeader, StatusChip, TableScroll } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, formatMyt, range } from "@/lib/format";
import { roundLabel } from "@/lib/steps";

const FILTERS: { key: string; label: string; statuses?: RequisitionStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI pre-check", statuses: ["Submitted", "AiPrecheck"] },
  { key: "hr", label: "With HR", statuses: ["WithHr"] },
  { key: "ret", label: "Returned to HM", statuses: ["ReturnedToHm"] },
  { key: "rej", label: "Rejected", statuses: ["Rejected"] },
  { key: "live", label: "Live", statuses: ["JobPosting", "Live"] },
];

function RequisitionsInner() {
  const params = useSearchParams();
  const { user } = useSession();
  const [filter, setFilter] = useState(params.get("status") ?? "all");
  const [q, setQ] = useState("");
  const reqs = useApi(() => api.requisitions.list(), [], { pollMs: 5000 });

  if (reqs.error) return <ErrorNote error={reqs.error} />;
  const all = reqs.data ?? [];
  const term = q.trim().toLowerCase();
  const searched = term ? all.filter((r) => [r.id, r.store, r.hm_name, r.region, r.role].some((x) => x.toLowerCase().includes(term))) : all;
  const def = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const rows = def.statuses ? searched.filter((r) => def.statuses!.includes(r.status)) : searched;

  return (
    <>
      <PageHeader
        title="Requisitions"
        subtitle={user.role === "HIRING_MANAGER" ? "Your job descriptions submitted to Flow 1." : "Every job description submitted to Flow 1. HR sees all; a hiring manager sees their own."}
        actions={
          user.role === "HIRING_MANAGER" && (
            <Button variant="contained" component={Link} href="/requisitions/new">
              New requisition
            </Button>
          )
        }
      />
      <Card component="section" aria-label="Requisition list">
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Box role="group" aria-label="Filter by stage" sx={{ display: "flex", flexWrap: "wrap", gap: 1, flex: "1 1 auto" }}>
            {FILTERS.map((f) => {
              const n = f.statuses ? searched.filter((r) => f.statuses!.includes(r.status)).length : searched.length;
              const sel = f.key === def.key;
              return (
                <Chip
                  key={f.key}
                  label={`${f.label} (${n})`}
                  clickable
                  color={sel ? "primary" : "default"}
                  variant={sel ? "filled" : "outlined"}
                  aria-pressed={sel}
                  onClick={() => setFilter(f.key)}
                />
              );
            })}
          </Box>
          <TextField size="small" type="search" label="Search ID, store or HM" placeholder="e.g. KLIA2" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 220 }} />
        </Box>
        {reqs.loading && !reqs.data ? (
          <Loading />
        ) : (
          <TableScroll label="Requisitions table">
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  {["Requisition", "Department", "Role & store", "Region", "Hiring manager", "Openings", "Base range", "Stage", "Round", "Last update (MYT)"].map((h) => (
                    <TableCell key={h} scope="col">
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <NextLink href={`/requisitions/${r.id}`} sx={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                        {r.id}
                      </NextLink>
                    </TableCell>
                    <TableCell>{r.department}</TableCell>
                    <TableCell>
                      {r.role}
                      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                        {r.store}
                      </Typography>
                    </TableCell>
                    <TableCell>{r.region}</TableCell>
                    <TableCell>{r.hm_name}</TableCell>
                    <TableCell>{r.openings}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{r.base_min ? range(r.base_min, r.base_max) : "–"}</TableCell>
                    <TableCell>
                      <StatusChip tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{roundLabel(r)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatMyt(r.updated_at)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Typography color="text.secondary">No requisitions match.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableScroll>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1.5 }}>
          <DataSourceBadge kind="app">App store · ID, department, role, store, HM, openings, range, Opus job ID</DataSourceBadge>
          <DataSourceBadge kind="mst">Master data · region</DataSourceBadge>
          <DataSourceBadge kind="aud">Opus audit · stage + round (running node → label)</DataSourceBadge>
          <DataSourceBadge kind="dir">Directory · HM name</DataSourceBadge>
        </Box>
      </Card>
    </>
  );
}

export default function RequisitionsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RequisitionsInner />
    </Suspense>
  );
}
