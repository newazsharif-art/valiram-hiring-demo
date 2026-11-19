"use client";
import Link from "next/link";
import {
  Alert,
  Box,
  Breadcrumbs,
  Card,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import InfoIcon from "@mui/icons-material/Info";
import CheckIcon from "@mui/icons-material/Check";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import type { Finding } from "@/domain/types";
import type { ChipTone } from "@/lib/format";
import { CHIP_COLORS } from "@/theme/theme";
import { useSession } from "./SessionProvider";

export function StatusChip({ tone, label, sx }: { tone: ChipTone; label: string; sx?: SxProps<Theme> }) {
  const c = CHIP_COLORS[tone];
  return (
    <Box
      component="span"
      sx={[
        (theme) => ({
          display: "inline-flex",
          alignItems: "center",
          height: 24,
          px: 1.25,
          borderRadius: 3,
          fontSize: 12.5,
          fontWeight: 500,
          whiteSpace: "nowrap",
          bgcolor: c.light[0],
          color: c.light[1],
          ...theme.applyStyles("dark", { bgcolor: c.dark[0], color: c.dark[1] }),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {label}
    </Box>
  );
}

export function NextLink({ href, children, sx }: { href: string; children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <MuiLink component={Link} href={href} sx={sx}>
      {children}
    </MuiLink>
  );
}

export function PageHeader({
  crumbs,
  title,
  chips,
  subtitle,
  actions,
}: {
  crumbs?: { label: string; href?: string }[];
  title: React.ReactNode;
  chips?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end", justifyContent: "space-between" }}>
      <Box sx={{ minWidth: 0 }}>
        {crumbs && (
          <Breadcrumbs aria-label="Breadcrumb" sx={{ fontSize: 14, color: "text.secondary" }}>
            {crumbs.map((c) =>
              c.href ? (
                <MuiLink key={c.label} component={Link} href={c.href} underline="hover">
                  {c.label}
                </MuiLink>
              ) : (
                <Typography key={c.label} component="span" sx={{ fontSize: 14 }} color="text.secondary">
                  {c.label}
                </Typography>
              ),
            )}
          </Breadcrumbs>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", mt: crumbs ? 0.75 : 0 }}>
          <Typography variant="h1">{title}</Typography>
          {chips}
        </Box>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>{actions}</Box>}
    </Box>
  );
}

export function SectionCard({
  title,
  actions,
  source,
  children,
  sx,
  id,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  source?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  id?: string;
}) {
  return (
    <Card component="section" sx={[{ minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]} aria-labelledby={id}>
      {(title || actions) && (
        <Box
          sx={{
            px: 2,
            py: 1.75,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
            {title && (
              <Typography variant="h2" id={id}>
                {title}
              </Typography>
            )}
            {source}
          </Box>
          {actions}
        </Box>
      )}
      {children}
    </Card>
  );
}

const SOURCE_STYLE: Record<string, { light: [string, string, string]; dark: [string, string, string] }> = {
  app: { light: ["#37474f", "#eceff1", "#607d8b"], dark: ["#cfd8dc", "rgba(176,190,197,.12)", "#78909c"] },
  aud: { light: ["#0d47a1", "#e3f2fd", "#1976d2"], dark: ["#bbdefb", "rgba(144,202,249,.12)", "#64b5f6"] },
  task: { light: ["#6a1b9a", "#f3e5f5", "#8e24aa"], dark: ["#e1bee7", "rgba(206,147,216,.12)", "#ba68c8"] },
  mst: { light: ["#1b5e20", "#e8f5e9", "#43a047"], dark: ["#c8e6c9", "rgba(129,199,132,.12)", "#66bb6a"] },
  dir: { light: ["#8a4500", "#fff3e0", "#ef6c00"], dark: ["#ffe0b2", "rgba(255,183,77,.12)", "#ffa726"] },
};

/** "Data sources" label (mockup device). Only visible when NEXT_PUBLIC_SHOW_SOURCES=true and toggled on. */
export function DataSourceBadge({ kind, children }: { kind: keyof typeof SOURCE_STYLE; children: React.ReactNode }) {
  const { showSources } = useSession();
  if (process.env.NEXT_PUBLIC_SHOW_SOURCES !== "true" || !showSources) return null;
  const s = SOURCE_STYLE[kind];
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: "inline-flex",
        alignItems: "center",
        font: '500 11px "Roboto Mono", monospace',
        px: 0.75,
        py: 0.25,
        borderRadius: 1,
        border: "1px dashed",
        whiteSpace: "nowrap",
        color: s.light[0],
        bgcolor: s.light[1],
        borderColor: s.light[2],
        ...theme.applyStyles("dark", { color: s.dark[0], bgcolor: s.dark[1], borderColor: s.dark[2] }),
      })}
    >
      {children}
    </Box>
  );
}

export function WaitingBanner({ children }: { children: React.ReactNode }) {
  return (
    <Alert severity="warning" icon={<HourglassTopIcon />} role="note">
      {children}
    </Alert>
  );
}

export type StepState = "done" | "current" | "todo" | "failed";
export interface FlowStep {
  label: string;
  sub?: string;
  state: StepState;
}

/** Horizontal stepper as in the mockup; wraps on narrow screens. */
export function FlowStepper({ steps, label }: { steps: FlowStep[]; label: string }) {
  return (
    <Box
      component="ol"
      aria-label={label}
      sx={{
        listStyle: "none",
        m: 0,
        p: 2,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: `repeat(${steps.length}, minmax(0, 1fr))` },
        gap: 2,
      }}
    >
      {steps.map((s, i) => (
        <Box component="li" key={s.label} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", minWidth: 0 }} aria-current={s.state === "current" ? "step" : undefined}>
          <Box
            aria-hidden
            sx={(theme) => {
              const bg = { done: ["#2e7d32", "#66bb6a"], current: ["#ef6c00", "#ffb74d"], todo: ["rgba(0,0,0,.26)", "rgba(255,255,255,.3)"], failed: ["#c62828", "#ef5350"] }[s.state];
              return {
                width: 28,
                height: 28,
                flex: "none",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 500,
                bgcolor: bg[0],
                color: "#fff",
                ...theme.applyStyles("dark", { bgcolor: bg[1], color: s.state === "done" ? "#0b2810" : s.state === "current" ? "#3e2700" : "#121212" }),
              };
            }}
          >
            {s.state === "done" ? <CheckIcon sx={{ fontSize: 18 }} /> : s.state === "failed" ? <CancelIcon sx={{ fontSize: 18 }} /> : i + 1}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500, fontSize: 14 }}>
              {s.label}
              <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                {` (${s.state === "done" ? "done" : s.state === "current" ? "in progress" : s.state === "failed" ? "stopped" : "not started"})`}
              </Box>
            </Typography>
            {s.sub && (
              <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
                {s.sub}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 120 }}>
      <Typography component="span" sx={{ fontWeight: 500, minWidth: 36, fontSize: 14 }}>
        {score}%
      </Typography>
      <Box
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label="KitaHQ score"
        sx={(theme) => ({ flex: 1, height: 6, borderRadius: 3, bgcolor: "rgba(0,0,0,.12)", overflow: "hidden", ...theme.applyStyles("dark", { bgcolor: "rgba(255,255,255,.16)" }) })}
      >
        <Box sx={{ width: `${score}%`, height: "100%", bgcolor: "primary.main" }} />
      </Box>
    </Box>
  );
}

export function KeyValues({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px 24px" }}>
      {items.map(([k, v]) => (
        <Box key={k}>
          <Typography component="dt" color="text.secondary" sx={{ fontSize: 12.5 }}>
            {k}
          </Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: 14, overflowWrap: "anywhere" }}>
            {v}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <Stack component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {findings.map((f, i) => (
        <Box
          component="li"
          key={`${f.code}-${i}`}
          sx={{ display: "flex", gap: 1.25, py: 1, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 } }}
        >
          {f.result === "pass" ? (
            <CheckCircleIcon color="success" fontSize="small" aria-label="Passed" />
          ) : f.result === "fail" ? (
            <CancelIcon color="error" fontSize="small" aria-label="Issue" />
          ) : (
            <InfoIcon color="info" fontSize="small" aria-label="Advisory" />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{f.title}</Typography>
            {f.detail && (
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                {f.detail}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <Box role="status" sx={{ display: "flex", gap: 1.5, alignItems: "center", p: 3 }}>
      <CircularProgress size={20} />
      <Typography color="text.secondary">{label}…</Typography>
    </Box>
  );
}

export function ErrorNote({ error }: { error: Error & { status?: number } }) {
  return (
    <Alert severity="error" role="alert">
      {error.message}
    </Alert>
  );
}

/** Table wrapper that scrolls horizontally inside its own box (phone widths). */
export function TableScroll({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <Box sx={{ overflowX: "auto", width: "100%" }} role="region" aria-label={label} tabIndex={0}>
      {children}
    </Box>
  );
}
