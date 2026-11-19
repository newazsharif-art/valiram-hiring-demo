/**
 * Rule-based stand-in for the Opus "AI pre-check" step (Agentic Review / Opus Agent).
 * Scope per context §4 Flow 1 step 3: wording/compliance, Valiram rules,
 * content in the wrong place, and quality. Structural checks are done by form validation.
 */
import type { Finding, JdSections } from "@/domain/types";

const DISCRIMINATORY: [RegExp, string][] = [
  [/\baged?\s*\d{2}|\b\d{2}\s*[-–]\s*\d{2}\s*(years|yrs|y\/o)?\b(?!\s*(hours|hrs|am|pm))|\bbelow\s+\d{2}\b|\bunder\s+\d{2}\b|\byoung\b/i, "age requirement"],
  [/\b(male|female|men only|women only|gender|lady|ladies)\b/i, "gender requirement"],
  [/\b(malay|chinese|indian)\s+(only|preferred|speaker only)|\brace\b/i, "race requirement"],
  [/\b(muslim|christian|buddhist|hindu|religion)\b/i, "religion requirement"],
  [/\b(nationality|malaysian only|citizens only)\b/i, "nationality requirement"],
  [/\b(single|married|unmarried|marital)\b/i, "marital status requirement"],
  [/\b(good[- ]looking|attractive|pretty|handsome|fair[- ]skinned?|height|weight|slim)\b/i, "looks requirement"],
];

const VALIRAM_RULES: [RegExp, string][] = [
  [/^(?!.*\bno\s+cv\b).*\b(cv|resume)\b/i, "CV demand"],
  [/\b(degree|diploma|spm|stpm)\b/i, "degree/SPM demand"],
];

const WRONG_PLACE: [RegExp, string][] = [
  [/\bRM\s?\d|\b\d{3,5}\s?(ringgit|myr)\b/i, "salary in the text (it comes from the requisition fields)"],
  [/\b(\+?60|0)1\d[- ]?\d{3,4}[- ]?\d{4}\b/, "phone number"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "email address"],
  [/\b(https?:\/\/|www\.)\S+/i, "outside apply link"],
];

const PLACEHOLDER = /\b(tbd|tbc|lorem|ipsum|xxx+|insert\s+here)\b|\[[^\]]*\]/i;

function hmText(jd: Omit<JdSections, "how_to_apply"> & { how_to_apply?: string }): { label: string; text: string }[] {
  return [
    { label: "About the role", text: jd.about },
    { label: "What you will do", text: jd.duties.join("\n") },
    { label: "What we look for", text: jd.requirements.join("\n") },
    { label: "Benefits", text: jd.benefits },
    { label: "Shift pattern", text: jd.shift_pattern ?? "" },
  ];
}

function scan(parts: { label: string; text: string }[], rules: [RegExp, string][]): string[] {
  const hits: string[] = [];
  for (const p of parts) {
    for (const line of p.text.split("\n")) {
      for (const [re, what] of rules) {
        const m = line.match(re);
        if (m) hits.push(`"${line.trim()}" in ${p.label}: ${what}`);
      }
    }
  }
  return [...new Set(hits)];
}

export function runPrecheck(
  jd: JdSections,
  ctx: { store: string; region: string; role: string },
  mode: "auto" | "pass" | "fail" = "auto",
): Finding[] {
  const parts = hmText(jd);
  const findings: Finding[] = [];
  const duties = jd.duties.filter((d) => d.trim());

  findings.push(
    duties.length >= 3
      ? { code: "duties", result: "pass", title: "Duties list complete", detail: `${duties.length} points in What you will do` }
      : { code: "duties", result: "fail", title: `"What you will do" has ${duties.length} point${duties.length === 1 ? "" : "s"}; the template asks for at least 3` },
  );

  const disc = scan(parts, DISCRIMINATORY);
  findings.push(
    disc.length
      ? { code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: disc.join("; ") }
      : { code: "wording", result: "pass", title: "No discriminatory wording", detail: "No age, gender, race, religion or looks requirements" },
  );

  const vr = scan(parts, VALIRAM_RULES);
  findings.push(
    vr.length
      ? { code: "valiram", result: "fail", title: "Valiram rules", detail: vr.join("; ") }
      : { code: "valiram", result: "pass", title: "Valiram rules met", detail: "No CV, degree or SPM demands" },
  );

  const wp = scan(parts, WRONG_PLACE);
  findings.push(
    wp.length
      ? { code: "placement", result: "fail", title: "Content in the wrong place", detail: wp.join("; ") }
      : { code: "placement", result: "pass", title: "No salary, contact details or outside links in the text" },
  );

  const oneWord = duties.filter((d) => d.split(/\s+/).length < 2);
  const ph = parts.filter((p) => PLACEHOLDER.test(p.text)).map((p) => p.label);
  findings.push(
    oneWord.length || ph.length
      ? {
          code: "quality",
          result: "fail",
          title: "Quality",
          detail: [oneWord.length ? `One-word duties: ${oneWord.join(", ")}` : "", ph.length ? `Placeholder text in ${ph.join(", ")}` : ""].filter(Boolean).join("; "),
        }
      : { code: "quality", result: "pass", title: "Quality", detail: `Reads as a ${ctx.role} JD; no placeholders` },
  );

  if (!jd.shift_pattern?.trim()) {
    findings.push({ code: "shift", result: "advisory", title: "Advisory", detail: "Shift pattern not described (e.g. 10 AM–10 PM rotating). Optional." });
  }

  if (mode === "pass") {
    return findings.map((f) => (f.result === "fail" ? { ...f, result: "advisory", title: `${f.title} (forced pass for demo)` } : f));
  }
  if (mode === "fail" && !findings.some((f) => f.result === "fail")) {
    findings.push({ code: "forced", result: "fail", title: "Forced failure (demo panel)", detail: "Pre-check outcome forced to fail from /demo" });
  }
  return findings;
}
