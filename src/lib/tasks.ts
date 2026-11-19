import type { Requisition, Task } from "@/domain/types";
import type { ChipTone } from "./format";

export function taskWhere(t: Task, r: Requisition): string {
  if (t.task_type === "SHORTLIST_REVIEW") {
    const n = Array.isArray(t.inputs.candidates) ? t.inputs.candidates.length : 0;
    return `${r.store} · ${n} candidates`;
  }
  return `${r.store} · HM ${r.hm_name}`;
}

export function taskChip(t: Task): { tone: ChipTone; label: string } {
  if (t.status === "closed") return { tone: "draft", label: "Closed in Opus" };
  if (t.status === "done") {
    const l = t.outcome_label ?? "Done";
    const tone: ChipTone = /reject/i.test(l) ? "esc" : /return/i.test(l) ? "ret" : t.task_type === "HM_JD_REVISE" ? "draft" : "live";
    return { tone, label: l };
  }
  if (t.task_type === "SHORTLIST_REVIEW") return { tone: "hr", label: "Flow 1b · shortlist" };
  if (t.task_type === "HM_JD_REVISE") return { tone: "ret", label: `Round ${t.round} of 3` };
  return { tone: "hr", label: t.round === 1 ? "Round 1 · AI pre-check passed" : `Round ${t.round}` };
}
