import { formatInTimeZone } from "date-fns-tz";
import type { Band, CandidateStatus, RequisitionStatus } from "@/domain/types";

export const TZ = "Asia/Kuala_Lumpur";

/** Format an ISO timestamp in Malaysia Time (MYT). */
export function formatMyt(
  iso: string | undefined,
  style: "short" | "full" | "date" | "time" | "feed" | "long-date" = "short",
): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  switch (style) {
    case "full":
      return `${formatInTimeZone(d, TZ, "d MMM yyyy, h:mm a")} MYT`;
    case "date":
      return formatInTimeZone(d, TZ, "d MMM yyyy");
    case "long-date":
      return formatInTimeZone(d, TZ, "EEEE d MMM yyyy");
    case "time":
      return formatInTimeZone(d, TZ, "h:mm a");
    case "feed": {
      const day = formatInTimeZone(d, TZ, "yyyy-MM-dd");
      const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      if (day === today) return `Today ${formatInTimeZone(d, TZ, "h:mm a")}`;
      if (ageDays < 6) return formatInTimeZone(d, TZ, "EEE h:mm a");
      return formatInTimeZone(d, TZ, "d MMM, h:mm a");
    }
    default:
      return formatInTimeZone(d, TZ, "d MMM, h:mm a");
  }
}

/** "since today, 10:16 AM MYT" / "since Fri 13 Nov, 3:20 PM MYT" */
export function sinceMyt(iso: string): string {
  const d = new Date(iso);
  const day = formatInTimeZone(d, TZ, "yyyy-MM-dd");
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  if (day === today) return `today, ${formatInTimeZone(d, TZ, "h:mm a")} MYT`;
  return `${formatInTimeZone(d, TZ, "EEE d MMM, h:mm a")} MYT`;
}

export function waitingFor(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.max(0, Math.floor(ms / 3600000));
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))} min`;
  const days = Math.floor(h / 24);
  return days > 0 ? `${days} day${days > 1 ? "s" : ""} ${h % 24} h` : `${h} h`;
}

export function rm(n: number): string {
  return n.toLocaleString("en-MY");
}

export function range(min: number, max: number): string {
  return `RM ${rm(min)} – ${rm(max)}`;
}

export type ChipTone = "live" | "hr" | "ret" | "esc" | "ai" | "draft" | "post";

export const STATUS_LABEL: Record<RequisitionStatus, string> = {
  Submitted: "Submitted",
  AiPrecheck: "AI pre-check",
  WithHr: "With HR",
  ReturnedToHm: "Returned to HM",
  JobPosting: "Job posting",
  Live: "Live",
  Rejected: "Rejected",
};

export const STATUS_TONE: Record<RequisitionStatus, ChipTone> = {
  Submitted: "ai",
  AiPrecheck: "ai",
  WithHr: "hr",
  ReturnedToHm: "ret",
  JobPosting: "post",
  Live: "live",
  Rejected: "esc",
};

export const BAND_LABEL: Record<Band, string> = { hi: "90%+", mid: "70–89%", lo: "Below 70%" };
export const BAND_TONE: Record<Band, ChipTone> = { hi: "live", mid: "hr", lo: "esc" };

export const CAND_STATUS_LABEL: Record<CandidateStatus, string> = {
  AwaitingHrReview: "Awaiting HR review",
  Shortlisted: "Shortlisted",
  ShortlistedByHr: "Shortlisted by HR",
  NotSelected: "Not selected",
  RegretSent: "Regret sent",
};
export const CAND_STATUS_TONE: Record<CandidateStatus, ChipTone> = {
  AwaitingHrReview: "hr",
  Shortlisted: "live",
  ShortlistedByHr: "live",
  NotSelected: "draft",
  RegretSent: "draft",
};

export function linesToList(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

export function listToLines(a: string[] | undefined): string {
  return (a ?? []).join("\n");
}
