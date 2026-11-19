"use client";
import { Box, TextField, Typography } from "@mui/material";
import type { JdSections } from "@/domain/types";
import { linesToList, listToLines } from "@/lib/format";

export interface JdDraft {
  about: string;
  duties: string;
  requirements: string;
  benefits: string;
  shift_pattern: string;
}

export type JdKey = keyof JdDraft;

export function toDraft(j: JdSections | undefined): JdDraft {
  return {
    about: j?.about ?? "",
    duties: listToLines(j?.duties),
    requirements: listToLines(j?.requirements),
    benefits: j?.benefits ?? "",
    shift_pattern: j?.shift_pattern ?? "",
  };
}

export function fromDraft(d: JdDraft) {
  return {
    about: d.about.trim(),
    duties: linesToList(d.duties),
    requirements: linesToList(d.requirements),
    benefits: d.benefits.trim(),
    shift_pattern: d.shift_pattern.trim(),
  };
}

const SECTIONS: { key: JdKey; label: string; hint: (d: JdDraft) => string; rows: number; help?: string; placeholder?: string }[] = [
  { key: "about", label: "About the role", hint: () => "Required · 2–4 sentences", rows: 3 },
  {
    key: "duties",
    label: "What you will do",
    hint: (d) => {
      const n = linesToList(d.duties).length;
      return n ? `${n} point${n > 1 ? "s" : ""} · at least 3` : "Required · one point per line, at least 3";
    },
    rows: 4,
  },
  {
    key: "requirements",
    label: "What we look for",
    hint: (d) => {
      const n = linesToList(d.requirements).length;
      return n ? `${n} point${n > 1 ? "s" : ""}` : "Required · one point per line";
    },
    rows: 3,
    help: "No age, gender, race, religion or looks requirements.",
  },
  { key: "benefits", label: "Benefits", hint: () => "Required", rows: 2 },
  { key: "shift_pattern", label: "Shift pattern", hint: (d) => (d.shift_pattern.trim() ? "Optional" : "Optional · empty"), rows: 2, placeholder: "e.g. 10 AM – 10 PM rotating, 5 days a week" },
];

export function JdSectionsEditor({
  value,
  onChange,
  howToApply,
  errors,
  markers,
  idPrefix = "jd",
  disabled,
}: {
  value: JdDraft;
  onChange: (v: JdDraft) => void;
  howToApply: string;
  errors?: Partial<Record<JdKey, string>>;
  /** Extra label per section, e.g. "Changed · HR comment". */
  markers?: Partial<Record<JdKey, string>>;
  idPrefix?: string;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SECTIONS.map((s) => {
        const id = `${idPrefix}-${s.key}`;
        const err = errors?.[s.key];
        return (
          <Box key={s.key}>
            <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 12px", alignItems: "baseline", mb: 0.5 }}>
              <Typography component="label" htmlFor={id} sx={{ fontSize: 13, fontWeight: 500 }}>
                {s.label}
              </Typography>
              <Typography component="span" color={markers?.[s.key] ? "warning.main" : "text.secondary"} sx={{ fontSize: 12 }}>
                {markers?.[s.key] ?? s.hint(value)}
              </Typography>
            </Box>
            <TextField
              id={id}
              fullWidth
              multiline
              minRows={s.rows}
              value={value[s.key]}
              onChange={(e) => onChange({ ...value, [s.key]: e.target.value })}
              error={!!err}
              helperText={err ?? s.help}
              placeholder={s.placeholder}
              disabled={disabled}
            />
          </Box>
        );
      })}
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, mb: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>How to apply</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 12 }}>
            Fixed text from Settings
          </Typography>
        </Box>
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1, px: 1.5, py: 1.25, color: "text.secondary", fontSize: 14 }}>{howToApply}</Box>
      </Box>
    </Box>
  );
}
