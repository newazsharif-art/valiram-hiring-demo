"use client";
import { Box, Typography } from "@mui/material";
import type { JdSections, Requisition } from "@/domain/types";
import { formatMyt, range } from "@/lib/format";

/** JD text by section (the mockup's ".jd" block). */
export function JdText({ jd }: { jd: JdSections }) {
  const parts: [string, string[] | string][] = [
    ["About the role", jd.about],
    ["What you will do", jd.duties],
    ["What we look for", jd.requirements],
    ["Benefits", jd.benefits],
    ...(jd.shift_pattern?.trim() ? ([["Shift pattern", jd.shift_pattern]] as [string, string][]) : []),
    ["How to apply", jd.how_to_apply],
  ];
  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        bgcolor: "#fafafa",
        fontSize: 14,
        lineHeight: 1.6,
        ...theme.applyStyles("dark", { bgcolor: "#121212" }),
      })}
    >
      {parts.map(([title, body]) => (
        <Box key={title} sx={{ "& + &": { mt: 1.5 } }}>
          <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{title}</Typography>
          {Array.isArray(body) ? (
            body.length ? (
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {body.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </Box>
            ) : (
              <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                (empty)
              </Typography>
            )
          ) : (
            <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{body || "(empty)"}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

/** HTML preview of the generated job post PDF (same layout as src/server/pdf.ts). */
export function JobPostPreview({ r }: { r: Requisition }) {
  const jd = r.jd_sections;
  const chip = { bgcolor: "#eef3f8", color: "#1d1d1d", borderRadius: 3, px: 1.25, py: "3px", fontSize: 13 };
  const h = { fontWeight: 600, mt: 1.25, mb: 0.5, fontSize: 14 };
  return (
    <Box
      role="img"
      aria-label={`Preview of the generated job post PDF for ${r.role}, ${r.store}`}
      sx={{ maxWidth: 640, width: "100%", boxSizing: "border-box", bgcolor: "#fff", color: "#1d1d1d", border: "1px solid #d0d0d0", borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,.25)", p: 3, display: "flex", flexDirection: "column", gap: 1.75 }}
    >
      <Box sx={{ display: "flex", gap: 1.75, alignItems: "center" }}>
        <Box sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: "#263238", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 22, flex: "none" }}>V</Box>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }}>{r.role}</Box>
          <Box sx={{ fontSize: 14, color: "#444" }}>Valiram · {r.store}, {r.region === "Pahang" ? "Pahang" : "Kuala Lumpur area"} (On-site)</Box>
          <Box sx={{ fontSize: 13, color: "#5c5c5c" }}>
            Posted {formatMyt(r.posting?.generated_at, "date")} · {r.department}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Box component="span" sx={chip}>{r.employment_type}</Box>
        <Box component="span" sx={chip}>{range(r.base_min, r.base_max)} / month + commission</Box>
        <Box component="span" sx={chip}>{r.openings} opening{r.openings > 1 ? "s" : ""}</Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, alignItems: "center" }}>
        <Box component="span" sx={{ bgcolor: "#0b57d0", color: "#fff", borderRadius: 5, px: 2.5, py: 1, fontWeight: 600, fontSize: 14 }}>Apply · video interview</Box>
        <Box component="span" sx={{ fontSize: 12, color: "#5c5c5c" }}>kitahq link · {r.id} (QR code in PDF)</Box>
      </Box>
      <Box sx={{ borderTop: "1px solid #e0e0e0", pt: 1.5, fontSize: 14, lineHeight: 1.55 }}>
        <Box sx={{ ...h, mt: 0 }}>About the job</Box>
        <div>{jd.about}</div>
        <Box sx={h}>What you will do</Box>
        <div>{jd.duties.map((d, i) => <div key={i}>• {d}</div>)}</div>
        <Box sx={h}>What we look for</Box>
        <div>{jd.requirements.map((d, i) => <div key={i}>• {d}</div>)}</div>
        <Box sx={h}>Benefits</Box>
        <div>{jd.benefits}</div>
        {jd.shift_pattern?.trim() && (
          <>
            <Box sx={h}>Shift pattern</Box>
            <div>{jd.shift_pattern}</div>
          </>
        )}
        <Box sx={h}>How to apply</Box>
        <div>{jd.how_to_apply}</div>
      </Box>
    </Box>
  );
}
