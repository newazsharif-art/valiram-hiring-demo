import type { Requisition } from "@/domain/types";
import type { FlowStep } from "@/components/ui";
import { formatMyt } from "./format";

/** Flow 1 stepper: Submitted → AI pre-check → HR verification → Job posting → Live. */
export function flow1Steps(r: Requisition): FlowStep[] {
  const t = (k: string) => (r.stage_times[k] ? formatMyt(r.stage_times[k]) : undefined);
  const last = r.reviews[r.reviews.length - 1];
  const approved = r.reviews.find((x) => x.hr?.decision === "approve");
  const s: FlowStep[] = [
    { label: "Submitted", state: "todo" },
    { label: "AI pre-check", state: "todo" },
    { label: "HR verification", state: "todo" },
    { label: "Job posting", state: "todo" },
    { label: r.status === "Rejected" ? "Rejected" : "Live", state: "todo" },
  ];
  s[0] = { ...s[0], state: "done", sub: `${t("Submitted") ?? ""} · REQ + Opus job created` };
  switch (r.status) {
    case "Submitted":
    case "AiPrecheck":
      s[1] = { ...s[1], state: "current", sub: `Running · round ${r.round} of 3` };
      break;
    case "WithHr":
      s[1] = { ...s[1], state: "done", sub: `Passed in round ${r.round}` };
      s[2] = { ...s[2], state: "current", sub: `Waiting for ${r.hr_name ?? "HR"} · round ${r.round}` };
      break;
    case "ReturnedToHm":
      if (last?.precheck && !last.precheck.pass) {
        s[1] = { ...s[1], state: "current", sub: `Issues found · returned to HM (round ${r.round})` };
      } else {
        s[1] = { ...s[1], state: "done", sub: `Passed in round ${r.round}` };
        s[2] = { ...s[2], state: "current", sub: `Returned to HM · round ${r.round}` };
      }
      break;
    case "JobPosting":
      s[1] = { ...s[1], state: "done", sub: `Passed in round ${r.round}` };
      s[2] = { ...s[2], state: "done", sub: `Approved${approved?.hr?.edited ? " with edits" : ""} · ${approved?.hr?.by ?? ""}` };
      s[3] = { ...s[3], state: "current", sub: "Generating LinkedIn-style PDF (demo)" };
      break;
    case "Live":
      s[1] = { ...s[1], state: "done", sub: `Passed in round ${approved?.round ?? r.round}` };
      s[2] = { ...s[2], state: "done", sub: `Approved${approved?.hr?.edited ? " with edits" : ""} · ${approved?.hr?.by ?? ""}` };
      s[3] = { ...s[3], state: "done", sub: `LinkedIn-style PDF (demo) · ${formatMyt(r.posting?.generated_at)}` };
      s[4] = { ...s[4], state: "done", sub: "Slack #recruitment notified" };
      break;
    case "Rejected": {
      const pre = last?.precheck;
      s[1] = { ...s[1], state: pre?.pass ? "done" : "failed", sub: pre?.pass ? `Passed in round ${r.round}` : `Issues in round ${r.round}` };
      if (pre?.pass) s[2] = { ...s[2], state: "failed", sub: `Not approved in round ${r.round}` };
      s[4] = { ...s[4], state: "failed", sub: `${t("Rejected") ?? ""} · copy to a new requisition` };
      break;
    }
  }
  return s;
}

export function flow1bSteps(r: Requisition, total: number): FlowStep[] {
  const sl = r.shortlist;
  if (!sl) {
    return [
      { label: "Screening closed", state: "todo", sub: r.screening === "open" ? "KitaHQ screening open" : "After JD live" },
      { label: "Scores collected", state: "todo" },
      { label: "Score bands applied", state: "todo" },
      { label: "HR review (70–89%)", state: "todo" },
      { label: "Emails + Flow 2a", state: "todo" },
    ];
  }
  const done = sl.status === "Complete";
  const shortlisted = sl.counts.hi + (sl.selected ?? 0);
  return [
    { label: "Screening closed", state: "done", sub: `KitaHQ · ${formatMyt(sl.closed_at)}` },
    { label: "Scores collected", state: "done", sub: `${total} candidates` },
    { label: "Score bands applied", state: "done", sub: `${sl.counts.hi} · ${sl.counts.mid} · ${sl.counts.lo}` },
    {
      label: "HR review (70–89%)",
      state: done ? "done" : "current",
      sub: done ? (sl.counts.mid ? `${sl.selected ?? 0} selected · ${formatMyt(sl.review_done_at, "time")}` : "Skipped: band empty") : `Waiting for ${sl.review_by ?? "HR"}`,
    },
    { label: "Emails + Flow 2a", state: done ? "done" : "todo", sub: done ? `${shortlisted} shortlisted · ${total - shortlisted} regret` : "After HR review" },
  ];
}

export function roundLabel(r: Requisition): string {
  if (r.status === "Live" || r.status === "JobPosting") return `Approved in ${r.reviews.find((x) => x.outcome === "approved")?.round ?? r.round}`;
  return `${r.round} of 3`;
}
