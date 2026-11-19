/**
 * Mock data, matching the Claude Design mockup and the demo cast (context file §9).
 * All names are illustrative. Timestamps are written in MYT and stored as UTC ISO strings.
 */
import type {
  Candidate,
  Finding,
  JdSections,
  Requisition,
  Settings,
  TaskRecord,
  User,
} from "./types";

export const HOW_TO_APPLY = "Click apply to record a short video interview on KitaHQ. No CV needed.";

/** "2026-11-16 10:16" (MYT) -> ISO UTC */
export function at(myt: string): string {
  return new Date(`${myt.replace(" ", "T")}:00+08:00`).toISOString();
}

// ---------------------------------------------------------------- master data

export const USERS: User[] = [
  { id: "siti", name: "Siti Rahman", initials: "SR", role: "HR_RECRUITER", title: "HR recruiter", tasks: "HR verification, Shortlist review", scope: "All regions (pool or named per requisition TBC)", switchable: true },
  { id: "jason", name: "Jason Lim", initials: "JL", role: "HIRING_MANAGER", title: "Hiring manager · KLIA", tasks: "Revise JD (if in app)", scope: "Own requisitions", switchable: true },
  { id: "aaron", name: "Aaron Wong", initials: "AW", role: "HR_ADMIN", title: "HR admin", tasks: "–", scope: "Settings", switchable: true },
  { id: "nurul", name: "Nurul Aina", initials: "NA", role: "HIRING_MANAGER", title: "Hiring manager · KL City", tasks: "Revise JD (if in app)", scope: "Own requisitions", switchable: false },
  { id: "farid", name: "Farid Hassan", initials: "FH", role: "HIRING_MANAGER", title: "Store manager · Mid Valley", tasks: "Revise JD (if in app)", scope: "Own requisitions", switchable: false },
  { id: "priya", name: "Priya Nair", initials: "PN", role: "HIRING_MANAGER", title: "Store manager · Sunway", tasks: "Revise JD (if in app)", scope: "Own requisitions", switchable: false },
  { id: "aiman", name: "Aiman Zulkifli", initials: "AZ", role: "HIRING_MANAGER", title: "Area manager · South", tasks: "Revise JD (if in app)", scope: "Own requisitions", switchable: false },
];

export function seedSettings(): Settings {
  return {
    departments: [
      { id: "ops", name: "Retail Operations", roles: ["Retail Sales Associate", "Senior Sales Associate", "Cashier"], template: "Default", active: true },
      { id: "beauty", name: "Beauty & Fragrance", roles: ["Beauty Advisor", "Fragrance Specialist"], template: "Default", active: true },
      { id: "watch", name: "Watches & Jewellery", roles: ["Watch Specialist", "Jewellery Sales Associate"], template: "Default", active: true },
    ],
    stores: [
      { id: "mvm", name: "Mid Valley Megamall", region: "KL City", manager: "Farid Hassan", active: true },
      { id: "pav", name: "Pavilion KL", region: "KL City", manager: "Nurul Aina", active: true },
      { id: "trx", name: "The Exchange TRX", region: "KL City", manager: "Hafiz Rahim", active: true },
      { id: "klia2", name: "KLIA2 Departures", region: "KLIA & Sepang", manager: "Jason Lim", active: true },
      { id: "klia1", name: "KLIA Main Terminal", region: "KLIA & Sepang", manager: "Jason Lim", active: true },
      { id: "sunway", name: "Sunway Pyramid", region: "Selangor", manager: "Priya Nair", active: true },
      { id: "ioi", name: "IOI City Mall", region: "Putrajaya & Sepang", manager: "Aiman Zulkifli", active: true },
      { id: "genting", name: "Genting Premium Outlets", region: "Pahang", manager: "Aiman Zulkifli", active: false },
    ],
    template: {
      version: "T1 (Default)",
      how_to_apply: HOW_TO_APPLY,
      sections: [
        { key: "about", label: "About the role", shown_as: "Text box", required: true, rule: "Not empty" },
        { key: "duties", label: "What you will do", shown_as: "Bullet list (one per line)", required: true, rule: "At least 3 points" },
        { key: "requirements", label: "What we look for", shown_as: "Bullet list (one per line)", required: true, rule: "No age, gender, race, religion or looks requirements; no CV or degree demand" },
        { key: "benefits", label: "Benefits", shown_as: "Text box", required: true, rule: "Not empty" },
        { key: "shift_pattern", label: "Shift pattern", shown_as: "Text box", required: false, rule: "Advisory only" },
        { key: "how_to_apply", label: "How to apply", shown_as: "Fixed text (edited here)", required: true, rule: "Not editable by HM" },
      ],
    },
    rules: {
      auto_min: 90,
      review_min: 70,
      shortlisted_email: "You've been shortlisted – next steps",
      regret_email: "Thank you for your interest in Valiram",
    },
    users: USERS,
    connections: [
      { name: "Opus Jobs API (service key)", used_for: "Start Flow 1, read status and audit", status: "mock", status_text: "Demo: Opus simulator", note: "Set DATA_MODE=opus and OPUS_SERVICE_KEY to connect" },
      { name: "Opus Off-Platform webhook (one per workspace)", used_for: "Receives HR verification tasks", status: "mock", status_text: "Demo: simulator delivers tasks in-process" },
      { name: "Opus organisation verified", used_for: "Required for Off-Platform nodes", status: "warn", status_text: "To confirm with Opus" },
      { name: "LinkedIn · Indeed · JobStreet", used_for: "Job posting (partner APIs, after demo)", status: "mock", status_text: "Demo: job post PDF instead" },
      { name: "Valiram Careers site", used_for: "Job posting (after demo)", status: "mock", status_text: "Demo: job post PDF instead" },
      { name: "KitaHQ", used_for: "Apply link with requisition ID", status: "mock", status_text: "Mocked in demo" },
      { name: "Slack #recruitment", used_for: "Notifications", status: "mock", status_text: "Mocked in demo (logged to activity)" },
    ],
    node_map: [
      { node: "n_precheck_r1", type: "Agentic Review", stage: "AI pre-check", round: "1" },
      { node: "n_hr_verify_r1", type: "Off-Platform Review", stage: "With HR", round: "1" },
      { node: "n_hm_revise_r1", type: "Human Task", tbc: "or Off-Platform", stage: "Returned to HM", round: "1" },
      { node: "n_precheck_r2 … n_hr_verify_r3", type: "(same pattern)", stage: "AI pre-check / With HR / Returned", round: "2–3" },
      { node: "n_reject", type: "External Service", stage: "Rejected (after round 3)", round: "–" },
      { node: "n_job_posting", type: "Opus Code (generates PDF in demo)", stage: "Job posting", round: "–" },
      { node: "n_notify", type: "Integration (Slack, PDF attached)", stage: "JD live", round: "–" },
      { node: "s_collect_scores", type: "External Service (KitaHQ via relay)", stage: "Flow 1b · Scores collected", round: "–" },
      { node: "s_band", type: "Opus Code", stage: "Flow 1b · Score bands applied", round: "–" },
      { node: "s_hr_review", type: "Off-Platform Review", tbc: "TBC", stage: "Flow 1b · HR review (70–89%)", round: "–" },
      { node: "s_email_shortlisted · s_email_regret", type: "Integration (Gmail)", stage: "Flow 1b · Emails sent", round: "–" },
      { node: "s_start_2a", type: "External Service (Jobs API, loop mode)", stage: "Flow 1b · Flow 2a started", round: "–" },
    ],
  };
}

// ---------------------------------------------------------------- requisitions

const F = {
  sections: (detail = "About, duties, requirements, benefits, how to apply"): Finding => ({ code: "sections", result: "pass", title: "Template sections present", detail }),
  salary: (detail: string): Finding => ({ code: "salary", result: "pass", title: "Salary range filled", detail }),
  wording: (): Finding => ({ code: "wording", result: "pass", title: "No discriminatory wording", detail: "No age, gender, race, religion or looks requirements" }),
  region: (detail: string): Finding => ({ code: "region", result: "pass", title: "Store region valid", detail }),
};

function jd(p: Omit<JdSections, "how_to_apply">): JdSections {
  return { ...p, how_to_apply: HOW_TO_APPLY };
}

type Seed = Omit<Requisition, "employment_type" | "template_version" | "screening" | "opus_job_ids" | "stage_times" | "store_id" | "hm_name"> &
  Partial<Pick<Requisition, "screening" | "opus_job_ids" | "stage_times" | "store_id" | "hm_name">>;

function req(s: Seed): Requisition {
  const settings = seedSettings();
  const store = settings.stores.find((x) => x.name === s.store)!;
  const hm = USERS.find((u) => u.id === s.hm_user)!;
  return {
    employment_type: "Full-time",
    template_version: "T1 (Default)",
    screening: "not_open",
    opus_job_ids: {},
    stage_times: {},
    ...s,
    store_id: store.id,
    hm_name: hm.name,
  };
}

const JD_001_V1 = jd({
  about: "Welcome shoppers, share product knowledge and close sales in a premium beauty and fashion store.",
  duties: ["Greet and assist customers"],
  requirements: ["Friendly and confident when speaking with customers", "Able to work retail shifts, weekends and public holidays"],
  benefits: "Staff discount, commission, EPF, SOCSO, medical",
});
const JD_001_V2 = jd({
  ...JD_001_V1,
  duties: ["Greet and assist customers, in English and Bahasa Malaysia", "Meet personal and store sales targets", "Keep displays and stock tidy; support stock counts"],
  shift_pattern: "",
});
const JD_001_V3 = jd({ ...JD_001_V2, benefits: "Staff discount, commission, EPF, SOCSO, medical, uniform provided" });

const JD_002 = jd({
  about: "Be the first smile shoppers see in our luxury watch and fashion boutique. You will guide customers, share product stories and close sales.",
  duties: ["Welcome and assist local and tourist customers", "Meet personal and store sales targets", "Keep displays, stock and the boutique spotless", "Support stock counts and visual merchandising"],
  requirements: ["Confident, warm speaker in English and Bahasa Malaysia", "Able to work retail shifts, weekends and public holidays", "Retail experience is a plus, not a must"],
  benefits: "Staff discount, sales commission, EPF, SOCSO, medical and dental, uniform provided",
  shift_pattern: "",
});

const JD_003_V1 = jd({
  about: "Help travellers find the perfect fragrance or gift before their flight in our duty-free store.",
  duties: ["Welcome and advise international travellers", "Meet personal and store sales targets", "Keep displays and stock in order; support stock counts"],
  requirements: ["Aged 18–28", "Confident speaker in English, Bahasa Malaysia and Mandarin", "Able to work rotating shifts including nights, weekends and public holidays"],
  benefits: "Staff discount, sales commission, EPF, SOCSO, medical, uniform provided",
  shift_pattern: "Rotating 8-hour shifts across 24 hours, 6 days a week",
});
const JD_003_V2 = jd({
  ...JD_003_V1,
  requirements: ["Confident speaker in English, Bahasa Malaysia and Mandarin", "Able to work rotating shifts including nights, weekends and public holidays"],
});

const JD_008_V1 = jd({
  about: "Join our flagship boutique at The Exchange TRX and help customers discover premium fashion and accessories.",
  duties: ["Greet and assist customers", "Meet sales targets", "Keep the store tidy"],
  requirements: ["Good-looking and well groomed", "Able to work retail shifts, weekends and public holidays"],
  benefits: "Staff discount, sales commission, EPF, SOCSO, medical, uniform provided",
  shift_pattern: "",
});
const JD_008_V2 = jd({
  ...JD_008_V1,
  duties: ["Greet and assist local and tourist customers", "Meet personal and store sales targets", "Keep displays and stock tidy; support stock counts"],
  requirements: ["Well groomed and confident with customers", "Able to work retail shifts, weekends and public holidays"],
  shift_pattern: "10 AM – 10 PM rotating, 5 days a week",
});

const JD_004 = jd({
  about: "Lead the sales floor in our Sunway Pyramid store and coach a small team of sales associates.",
  duties: ["Lead daily sales briefings", "Coach new sales associates", "Handle VIP customers and after-sales"],
  requirements: ["Female, below 30", "Diploma or degree in retail management", "3 years retail experience"],
  benefits: "Staff discount, commission, EPF, SOCSO, medical",
  shift_pattern: "",
});

const JD_005 = jd({
  about: "Help families and tourists shop our fashion and accessories range at IOI City Mall.",
  duties: ["Greet and assist customers", "Meet personal and store sales targets", "Support stock counts and replenishment"],
  requirements: ["Friendly speaker in Bahasa Malaysia and English", "Able to work weekends and public holidays"],
  benefits: "Staff discount, commission, EPF, SOCSO, medical, uniform provided",
  shift_pattern: "",
});

const JD_019 = jd({
  about: "Advise travellers on skincare, make-up and fragrance in our duty-free beauty hall at KLIA Main Terminal.",
  duties: ["Give personalised beauty advice and demos", "Meet personal and counter sales targets", "Keep testers, displays and stock in order"],
  requirements: ["Passion for beauty and skincare", "Confident speaker in English and Bahasa Malaysia; Mandarin is a plus", "Able to work rotating shifts, weekends and public holidays"],
  benefits: "Staff discount, sales commission, EPF, SOCSO, medical, shift allowance, uniform provided",
  shift_pattern: "Rotating 8-hour shifts, 6 days a week",
});

const JD_021 = jd({
  about: "Handle payments and returns at our KLIA Main Terminal store.",
  duties: ["Cashier"],
  requirements: ["SPM certificate", "Chinese speaker only", "CV required"],
  benefits: "EPF, SOCSO",
  shift_pattern: "",
});

export function seedRequisitions(): Requisition[] {
  return [
    req({
      id: "REQ-2611-001", department: "Retail Operations", role: "Retail Sales Associate", store: "Mid Valley Megamall", region: "KL City",
      openings: 2, base_min: 1900, base_max: 2300, target_start: "2026-12-07", hm_user: "farid", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_001_V3, status: "Live", round: 2,
      opus_job_ids: { flow1: "7f3c-91ad-4b2e-e204", flow1b: "9c41-2e7a-6d10-b3f5" },
      posting: { generated_at: at("2026-11-11 10:07"), file_name: "job_post_REQ-2611-001.pdf" },
      created_at: at("2026-11-10 09:12"), updated_at: at("2026-11-16 10:16"), completed_at: at("2026-11-11 10:08"),
      stage_times: { Submitted: at("2026-11-10 09:12"), AiPrecheck: at("2026-11-10 09:12"), WithHr: at("2026-11-10 14:41"), JobPosting: at("2026-11-11 10:05"), Live: at("2026-11-11 10:07") },
      versions: [
        { version: 1, by: "Farid Hassan", by_role: "HM", at: at("2026-11-10 09:12"), change: "Submitted", sections: JD_001_V1 },
        { version: 2, by: "Farid Hassan", by_role: "HM", at: at("2026-11-10 14:40"), change: "Added duties and shift pattern after AI pre-check", sections: JD_001_V2 },
        { version: 3, by: "Siti Rahman", by_role: "HR", at: at("2026-11-11 10:05"), change: "Inline edits during HR verification (benefits wording)", sections: JD_001_V3, published: true },
      ],
      reviews: [
        { round: 1, outcome: "returned", precheck: { pass: false, at: at("2026-11-10 09:13"), findings: [F.sections(), { code: "duties", result: "fail", title: '"What you will do" has 1 point; the template asks for at least 3' }, F.wording(), F.region("Mid Valley Megamall → KL City")] }, hm: { by: "Farid Hassan", at: at("2026-11-10 14:40"), note: "Added duties." } },
        { round: 2, outcome: "approved", precheck: { pass: true, at: at("2026-11-10 14:41"), findings: [F.sections(), F.salary("RM 1,900 – 2,300 (requisition field)"), F.wording(), F.region("Mid Valley Megamall → KL City")] }, hr: { decision: "approve", by: "Siti Rahman", at: at("2026-11-11 10:05"), comments: "Reworded benefits to match the standard table. Good to go.", edited: true } },
      ],
      activity: [
        { at: at("2026-11-10 09:12"), text: "Farid Hassan submitted the JD. App started Flow 1 (Jobs API) and saved job ID 7f3c-91ad." },
        { at: at("2026-11-10 09:13"), text: "AI pre-check round 1: 1 issue (duties list too short). Returned to hiring manager." },
        { at: at("2026-11-10 14:40"), text: "Farid Hassan resubmitted (v2)." },
        { at: at("2026-11-10 14:41"), text: "AI pre-check round 2 passed. Opus paused at HR verification; task assigned to Siti Rahman." },
        { at: at("2026-11-11 10:05"), text: "Siti Rahman approved with edits. App returned the decision to Opus; Flow 1 resumed." },
        { at: at("2026-11-11 10:07"), text: "Job posting generated: LinkedIn-style post as PDF (demo). JD live." },
        { at: at("2026-11-11 10:08"), text: "Flow 1 completed. Slack #recruitment notified." },
        { at: at("2026-11-16 10:00"), text: "KitaHQ screening closed. App started Flow 1b (Shortlist), job 9c41-2e7a." },
        { at: at("2026-11-16 10:16"), text: "KitaHQ screening closed: 2 shortlisted (90%+), 6 for HR review, 14 regret emails sent." },
      ],
      screening: "closed",
      shortlist: {
        job_id: "9c41-2e7a-6d10-b3f5", status: "WaitingHrReview", closed_at: at("2026-11-16 10:00"), scored_at: at("2026-11-16 10:12"), banded_at: at("2026-11-16 10:16"), emails_at: at("2026-11-16 10:16"),
        counts: { hi: 2, mid: 6, lo: 14 }, review_task_id: "T-0001", review_by: "Siti Rahman", flow2a_started: true,
      },
    }),
    req({
      id: "REQ-2611-002", department: "Retail Operations", role: "Retail Sales Associate", store: "Pavilion KL", region: "KL City",
      openings: 3, base_min: 2000, base_max: 2400, target_start: "2027-01-04", hm_user: "nurul", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_002, status: "WithHr", round: 1, opus_job_ids: { flow1: "5a1d-07be-41c9-8a2f" },
      created_at: at("2026-11-13 15:18"), updated_at: at("2026-11-13 15:20"),
      stage_times: { Submitted: at("2026-11-13 15:18"), AiPrecheck: at("2026-11-13 15:18"), WithHr: at("2026-11-13 15:20") },
      versions: [{ version: 1, by: "Nurul Aina", by_role: "HM", at: at("2026-11-13 15:18"), change: "Submitted", sections: JD_002 }],
      reviews: [
        { round: 1, outcome: "pending", precheck: { pass: true, at: at("2026-11-13 15:20"), findings: [F.sections(), F.salary("RM 2,000 – 2,400 (requisition field)"), F.wording(), F.region("Pavilion KL → KL City"), { code: "shift", result: "advisory", title: "Advisory", detail: "Shift pattern not described (e.g. 10 AM–10 PM rotating). Optional." }] } },
      ],
      activity: [
        { at: at("2026-11-13 15:18"), text: "Nurul Aina submitted the JD. App started Flow 1 (Jobs API) and saved job ID 5a1d-07be." },
        { at: at("2026-11-13 15:20"), text: "Pavilion KL passed AI pre-check; task sent to HR." },
        { at: at("2026-11-16 09:00"), text: "Reminder sent to Siti Rahman (HR verification waiting over 1 working day)." },
      ],
    }),
    req({
      id: "REQ-2611-003", department: "Retail Operations", role: "Retail Sales Associate", store: "KLIA2 Departures", region: "KLIA & Sepang",
      openings: 4, base_min: 1900, base_max: 2300, target_start: "2027-01-04", hm_user: "jason", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_003_V2, status: "ReturnedToHm", round: 2, opus_job_ids: { flow1: "3e90-b1c4-7a55-0d2e" },
      created_at: at("2026-11-12 10:30"), updated_at: at("2026-11-13 11:02"),
      stage_times: { Submitted: at("2026-11-12 10:30"), AiPrecheck: at("2026-11-12 16:10"), WithHr: at("2026-11-12 16:11"), ReturnedToHm: at("2026-11-13 11:02") },
      versions: [
        { version: 1, by: "Jason Lim", by_role: "HM", at: at("2026-11-12 10:30"), change: "Submitted", sections: JD_003_V1 },
        { version: 2, by: "Jason Lim", by_role: "HM", at: at("2026-11-12 16:10"), change: "Removed age requirement after AI pre-check", sections: JD_003_V2 },
      ],
      reviews: [
        { round: 1, outcome: "returned", precheck: { pass: false, at: at("2026-11-12 10:31"), findings: [F.sections(), { code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: '"Aged 18–28" in What we look for: age requirement' }, F.region("KLIA2 Departures → KLIA & Sepang")] }, hm: { by: "Jason Lim", at: at("2026-11-12 16:10"), note: "Removed the age line." } },
        { round: 2, outcome: "returned", precheck: { pass: true, at: at("2026-11-12 16:11"), findings: [F.sections(), F.salary("RM 1,900 – 2,300 (requisition field)"), F.wording(), F.region("KLIA2 Departures → KLIA & Sepang")] }, hr: { decision: "reject", by: "Siti Rahman", at: at("2026-11-13 11:02"), comments: "Mandarin should be a plus, not a requirement. Please also mention the night shift allowance.", edited: false } },
      ],
      activity: [
        { at: at("2026-11-12 10:30"), text: "Jason Lim submitted the JD. App started Flow 1 (Jobs API) and saved job ID 3e90-b1c4." },
        { at: at("2026-11-12 10:31"), text: "AI pre-check round 1: 1 issue (age requirement). Returned to hiring manager." },
        { at: at("2026-11-12 16:10"), text: "Jason Lim resubmitted (v2)." },
        { at: at("2026-11-12 16:11"), text: "AI pre-check round 2 passed. Opus paused at HR verification; task assigned to Siti Rahman." },
        { at: at("2026-11-13 11:02"), text: "KLIA2 returned to Jason Lim (round 2, HR comments)." },
      ],
    }),
    req({
      id: "REQ-2611-004", department: "Retail Operations", role: "Senior Sales Associate", store: "Sunway Pyramid", region: "Selangor",
      openings: 1, base_min: 2400, base_max: 2900, target_start: "2026-12-14", hm_user: "priya", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_004, status: "Rejected", round: 3, opus_job_ids: { flow1: "c27b-5f08-92e1-44aa" },
      created_at: at("2026-11-09 11:00"), updated_at: at("2026-11-13 16:55"), completed_at: at("2026-11-13 16:55"),
      stage_times: { Submitted: at("2026-11-09 11:00"), AiPrecheck: at("2026-11-12 15:30"), WithHr: at("2026-11-12 15:31"), Rejected: at("2026-11-13 16:55") },
      versions: [{ version: 1, by: "Priya Nair", by_role: "HM", at: at("2026-11-09 11:00"), change: "Submitted", sections: JD_004 }],
      reviews: [
        { round: 1, outcome: "returned", precheck: { pass: false, at: at("2026-11-09 11:01"), findings: [{ code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: '"Female, below 30": gender and age requirement' }, { code: "valiram", result: "fail", title: "Valiram rules", detail: '"Diploma or degree": no degree demands' }] }, hm: { by: "Priya Nair", at: at("2026-11-10 17:20"), note: "Resubmitted." } },
        { round: 2, outcome: "returned", precheck: { pass: false, at: at("2026-11-10 17:21"), findings: [{ code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: '"Female, below 30" still present' }] }, hm: { by: "Priya Nair", at: at("2026-11-12 15:30"), note: "Senior role needs experience." } },
        { round: 3, outcome: "rejected", precheck: { pass: true, at: at("2026-11-12 15:31"), findings: [F.sections(), F.wording()] }, hr: { decision: "reject", by: "Siti Rahman", at: at("2026-11-13 16:55"), comments: "Degree requirement and 3-year experience minimum are still not in line with Valiram policy. Please start a new requisition.", edited: false } },
      ],
      activity: [
        { at: at("2026-11-09 11:00"), text: "Priya Nair submitted the JD. App started Flow 1." },
        { at: at("2026-11-09 11:01"), text: "AI pre-check round 1: 2 issues. Returned to hiring manager." },
        { at: at("2026-11-10 17:21"), text: "AI pre-check round 2: 1 issue. Returned to hiring manager." },
        { at: at("2026-11-12 15:31"), text: "AI pre-check round 3 passed. Opus paused at HR verification." },
        { at: at("2026-11-13 16:55"), text: "Sunway Pyramid not approved after round 3; closed as Rejected, Priya Nair notified." },
      ],
    }),
    req({
      id: "REQ-2611-005", department: "Retail Operations", role: "Retail Sales Associate", store: "IOI City Mall", region: "Putrajaya & Sepang",
      openings: 2, base_min: 1900, base_max: 2200, target_start: "2027-01-11", hm_user: "aiman",
      jd_sections: JD_005, status: "AiPrecheck", round: 1, opus_job_ids: { flow1: "8d12-6e3f-c0b7-91d4" },
      created_at: at("2026-11-16 08:40"), updated_at: at("2026-11-16 08:40"),
      stage_times: { Submitted: at("2026-11-16 08:40"), AiPrecheck: at("2026-11-16 08:40") },
      versions: [{ version: 1, by: "Aiman Zulkifli", by_role: "HM", at: at("2026-11-16 08:40"), change: "Submitted", sections: JD_005 }],
      reviews: [],
      activity: [{ at: at("2026-11-16 08:40"), text: "IOI City Mall submitted by Aiman Zulkifli; AI pre-check running." }],
    }),
    req({
      id: "REQ-2611-008", department: "Retail Operations", role: "Retail Sales Associate", store: "The Exchange TRX", region: "KL City",
      openings: 2, base_min: 2000, base_max: 2400, target_start: "2027-01-04", hm_user: "nurul", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_008_V2, status: "WithHr", round: 2, opus_job_ids: { flow1: "e4a7-2c19-5b80-f36d" },
      created_at: at("2026-11-14 10:20"), updated_at: at("2026-11-16 09:05"),
      stage_times: { Submitted: at("2026-11-14 10:20"), AiPrecheck: at("2026-11-16 09:04"), WithHr: at("2026-11-16 09:05") },
      versions: [
        { version: 1, by: "Nurul Aina", by_role: "HM", at: at("2026-11-14 10:20"), change: "Submitted", sections: JD_008_V1 },
        { version: 2, by: "Nurul Aina", by_role: "HM", at: at("2026-11-16 09:04"), change: "Reworded grooming line; added duties and shift pattern", sections: JD_008_V2 },
      ],
      reviews: [
        { round: 1, outcome: "returned", precheck: { pass: false, at: at("2026-11-14 10:21"), findings: [{ code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: '"Good-looking": looks requirement' }, { code: "quality", result: "fail", title: "Quality", detail: "Duties are too short to be useful" }] }, hm: { by: "Nurul Aina", at: at("2026-11-16 09:04"), note: "Removed looks requirement." } },
        { round: 2, outcome: "pending", precheck: { pass: true, at: at("2026-11-16 09:05"), findings: [F.sections(), F.salary("RM 2,000 – 2,400 (requisition field)"), F.wording(), F.region("The Exchange TRX → KL City")] } },
      ],
      activity: [
        { at: at("2026-11-14 10:20"), text: "Nurul Aina submitted the JD. App started Flow 1 (Jobs API)." },
        { at: at("2026-11-14 10:21"), text: "AI pre-check round 1: 2 issues. Returned to hiring manager." },
        { at: at("2026-11-16 09:05"), text: "Passed AI pre-check (round 2) and is waiting for HR verification." },
      ],
    }),
    req({
      id: "REQ-2610-019", department: "Beauty & Fragrance", role: "Beauty Advisor", store: "KLIA Main Terminal", region: "KLIA & Sepang",
      openings: 3, base_min: 2100, base_max: 2600, target_start: "2026-12-01", hm_user: "jason", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_019, status: "Live", round: 1, opus_job_ids: { flow1: "1b6f-93d0-27ce-5a48" },
      posting: { generated_at: at("2026-10-28 14:14"), file_name: "job_post_REQ-2610-019.pdf" },
      created_at: at("2026-10-27 16:02"), updated_at: at("2026-10-28 14:15"), completed_at: at("2026-10-28 14:15"),
      stage_times: { Submitted: at("2026-10-27 16:02"), AiPrecheck: at("2026-10-27 16:02"), WithHr: at("2026-10-27 16:03"), JobPosting: at("2026-10-28 14:12"), Live: at("2026-10-28 14:14") },
      versions: [{ version: 1, by: "Jason Lim", by_role: "HM", at: at("2026-10-27 16:02"), change: "Submitted", sections: JD_019, published: true }],
      reviews: [
        { round: 1, outcome: "approved", precheck: { pass: true, at: at("2026-10-27 16:03"), findings: [F.sections(), F.salary("RM 2,100 – 2,600 (requisition field)"), F.wording(), F.region("KLIA Main Terminal → KLIA & Sepang")] }, hr: { decision: "approve", by: "Siti Rahman", at: at("2026-10-28 14:12"), comments: "Clear and complete.", edited: false } },
      ],
      activity: [
        { at: at("2026-10-27 16:02"), text: "Jason Lim submitted the JD. App started Flow 1 (Jobs API)." },
        { at: at("2026-10-27 16:03"), text: "AI pre-check round 1 passed. Opus paused at HR verification." },
        { at: at("2026-10-28 14:12"), text: "Siti Rahman approved. Flow 1 resumed." },
        { at: at("2026-10-28 14:14"), text: "Job posting generated: LinkedIn-style post as PDF (demo). JD live." },
      ],
      screening: "open",
    }),
    req({
      id: "REQ-2610-021", department: "Retail Operations", role: "Cashier", store: "KLIA Main Terminal", region: "KLIA & Sepang",
      openings: 1, base_min: 1700, base_max: 1900, target_start: "2026-12-01", hm_user: "jason", hr_assignee: "siti", hr_name: "Siti Rahman",
      jd_sections: JD_021, status: "Rejected", round: 3, opus_job_ids: { flow1: "f0a3-7d21-b84c-6e19" },
      created_at: at("2026-10-29 09:40"), updated_at: at("2026-11-06 17:12"), completed_at: at("2026-11-06 17:12"),
      stage_times: { Submitted: at("2026-10-29 09:40"), Rejected: at("2026-11-06 17:12") },
      versions: [{ version: 1, by: "Jason Lim", by_role: "HM", at: at("2026-10-29 09:40"), change: "Submitted", sections: JD_021 }],
      reviews: [
        { round: 1, outcome: "returned", precheck: { pass: false, at: at("2026-10-29 09:41"), findings: [{ code: "valiram", result: "fail", title: "Valiram rules", detail: '"CV required" and "SPM certificate": no CV or SPM demands' }, { code: "wording", result: "fail", title: "Discriminatory or risky wording", detail: '"Chinese speaker only": race/language exclusion' }] } },
        { round: 2, outcome: "returned", precheck: { pass: false, at: at("2026-11-03 10:02"), findings: [{ code: "duties", result: "fail", title: '"What you will do" has 1 point; the template asks for at least 3' }] } },
        { round: 3, outcome: "rejected", precheck: { pass: false, at: at("2026-11-06 17:12"), findings: [{ code: "valiram", result: "fail", title: "Valiram rules", detail: '"CV required" still present' }] } },
      ],
      activity: [
        { at: at("2026-10-29 09:40"), text: "Jason Lim submitted the JD. App started Flow 1." },
        { at: at("2026-11-06 17:12"), text: "Cashier, KLIA Main Terminal not approved after round 3; closed as Rejected, Jason Lim notified." },
      ],
    }),
  ];
}

// ---------------------------------------------------------------- tasks

const HR_SCHEMA = { decision: { type: "str", required: true }, edited_jd: { type: "object" }, hr_comments: { type: "str" } };
const HM_SCHEMA = { revised_jd: { type: "object", required: true }, hm_note: { type: "str" } };
const SL_SCHEMA = { selected_candidate_ids: { type: "array", required: true }, hr_note: { type: "str" } };
export const OUTPUT_SCHEMAS = { HR_JD_CHECK: HR_SCHEMA, HM_JD_REVISE: HM_SCHEMA, SHORTLIST_REVIEW: SL_SCHEMA };

export function seedTasks(reqs: Requisition[], cands: Candidate[]): TaskRecord[] {
  const r = (id: string) => reqs.find((x) => x.id === id)!;
  const cb = (exec: string, token: string) => ({ url: `/api/opus-sim/callback/${exec}`, token, token_header: "X-Opus-Callback-Token" });
  const lastFindings = (q: Requisition) => q.reviews[q.reviews.length - 1]?.precheck?.findings ?? [];
  const mid = cands.filter((c) => c.requisition_id === "REQ-2611-001" && c.band === "mid");
  return [
    {
      id: "T-0001", task_type: "SHORTLIST_REVIEW", execution_id: "9c41-2e7a-6d10-b3f5", workflow_id: "wf-flow1b", workflow_name: "Flow 1b · Shortlist", node_id: "s_hr_review",
      requisition_id: "REQ-2611-001", title: "Select candidates · 70–89% band", assignee: "siti", assignee_name: "Siti Rahman", status: "open",
      created_at: at("2026-11-16 10:16"), reminders: [],
      inputs: { task_type: "SHORTLIST_REVIEW", requisition_id: "REQ-2611-001", band: "70-89", candidates: mid.map((c) => ({ id: c.id, name: c.name, score: c.kitahq_score, note: c.kitahq_note })) },
      expected_output_schema: SL_SCHEMA, callback: cb("9c41-2e7a-6d10-b3f5", "tok-seed-0001"),
    },
    {
      id: "T-0002", task_type: "HR_JD_CHECK", execution_id: "5a1d-07be-41c9-8a2f", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hr_verify_r1",
      requisition_id: "REQ-2611-002", title: "Verify JD · Retail Sales Associate", round: 1, assignee: "siti", assignee_name: "Siti Rahman", status: "open",
      created_at: at("2026-11-13 15:20"), reminders: [at("2026-11-16 09:00")],
      inputs: { task_type: "HR_JD_CHECK", round: 1, jd_sections: r("REQ-2611-002").jd_sections, findings: lastFindings(r("REQ-2611-002")) },
      expected_output_schema: HR_SCHEMA, callback: cb("5a1d-07be-41c9-8a2f", "tok-seed-0002"),
    },
    {
      id: "T-0003", task_type: "HR_JD_CHECK", execution_id: "e4a7-2c19-5b80-f36d", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hr_verify_r2",
      requisition_id: "REQ-2611-008", title: "Verify JD · Retail Sales Associate", round: 2, assignee: "siti", assignee_name: "Siti Rahman", status: "open",
      created_at: at("2026-11-16 09:05"), reminders: [],
      inputs: { task_type: "HR_JD_CHECK", round: 2, jd_sections: r("REQ-2611-008").jd_sections, findings: lastFindings(r("REQ-2611-008")) },
      expected_output_schema: HR_SCHEMA, callback: cb("e4a7-2c19-5b80-f36d", "tok-seed-0003"),
    },
    {
      id: "T-0004", task_type: "HM_JD_REVISE", execution_id: "3e90-b1c4-7a55-0d2e", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hm_revise_r2",
      requisition_id: "REQ-2611-003", title: "Revise JD · Retail Sales Associate", round: 2, assignee: "jason", assignee_name: "Jason Lim", status: "open",
      created_at: at("2026-11-13 11:02"), reminders: [],
      inputs: {
        task_type: "HM_JD_REVISE", round: 2, jd_sections: r("REQ-2611-003").jd_sections, returned_by: "Siti Rahman",
        hr_comments: "Mandarin should be a plus, not a requirement. Please also mention the night shift allowance.",
        findings: [{ code: "wording", result: "fail", title: "Round 1 AI finding (fixed)", detail: '"Aged 18–28" removed: age requirement.' }],
        flagged_sections: ["requirements", "benefits"],
      },
      expected_output_schema: HM_SCHEMA, callback: cb("3e90-b1c4-7a55-0d2e", "tok-seed-0004"),
    },
    {
      id: "T-0005", task_type: "HR_JD_CHECK", execution_id: "7f3c-91ad-4b2e-e204", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hr_verify_r2",
      requisition_id: "REQ-2611-001", title: "Verified JD · approved with edits", round: 2, assignee: "siti", assignee_name: "Siti Rahman", status: "done",
      created_at: at("2026-11-10 14:41"), completed_at: at("2026-11-11 10:05"), outcome: "approve", outcome_label: "Approved", reminders: [],
      inputs: { task_type: "HR_JD_CHECK", round: 2 }, expected_output_schema: HR_SCHEMA, callback: cb("7f3c-91ad-4b2e-e204", "tok-seed-0005"),
    },
    {
      id: "T-0006", task_type: "HR_JD_CHECK", execution_id: "3e90-b1c4-7a55-0d2e", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hr_verify_r2",
      requisition_id: "REQ-2611-003", title: "Verified JD · returned to HM", round: 2, assignee: "siti", assignee_name: "Siti Rahman", status: "done",
      created_at: at("2026-11-12 16:11"), completed_at: at("2026-11-13 11:02"), outcome: "reject", outcome_label: "Returned", reminders: [],
      inputs: { task_type: "HR_JD_CHECK", round: 2 }, expected_output_schema: HR_SCHEMA, callback: cb("3e90-b1c4-7a55-0d2e", "tok-seed-0006"),
    },
    {
      id: "T-0007", task_type: "HM_JD_REVISE", execution_id: "3e90-b1c4-7a55-0d2e", workflow_id: "wf-flow1", workflow_name: "Flow 1 · Publish JD", node_id: "n_hm_revise_r1",
      requisition_id: "REQ-2611-003", title: "Revised JD · resubmitted", round: 1, assignee: "jason", assignee_name: "Jason Lim", status: "done",
      created_at: at("2026-11-12 10:31"), completed_at: at("2026-11-12 16:10"), outcome: "resubmitted", outcome_label: "Round 1", reminders: [],
      inputs: { task_type: "HM_JD_REVISE", round: 1 }, expected_output_schema: HM_SCHEMA, callback: cb("3e90-b1c4-7a55-0d2e", "tok-seed-0007"),
    },
  ];
}

// ---------------------------------------------------------------- candidates

type CastRow = [name: string, email: string, score: number, note: string, tags: string[], rehire?: boolean];

/** REQ-2611-001 demo cast: 2 at 90%+, 6 at 70–89%, 14 below 70%. */
export const CAST_001: CastRow[] = [
  ["Aisyah Rahman", "aisyah.r@example.com", 96, "Very clear and warm; EN, BM and Mandarin. Strong sales instinct.", ["English", "BM", "Mandarin"]],
  ["Wei Ling Tan", "weiling.t@example.com", 92, "Confident, polished answers; EN and Mandarin.", ["English", "Mandarin"]],
  ["Mei Chen", "mei.chen@example.com", 88, "Clear and friendly; prefers weekday shifts.", ["English", "BM", "Mandarin", "1 yr retail"]],
  ["Daniel Raj", "daniel.raj@example.com", 84, "Confident, asked good product questions. Available immediately.", ["English", "BM", "Tamil"]],
  ["Ravi Kumar", "ravi.k@example.com", 81, "Ex-Valiram (2023, Suria KLCC). Calm and experienced.", ["Rehire", "English", "BM"], true],
  ["Hafiz Ismail", "hafiz.i@example.com", 76, "Polite; hesitant in English, strong in BM.", ["BM", "Weekends OK"]],
  ["Siew Ping Lee", "siewping.l@example.com", 73, "Short answers; background noise in the video.", ["English", "Mandarin"]],
  ["Arjun Selvam", "arjun.s@example.com", 71, "Good energy; available weekends only.", ["English", "Tamil"]],
  ["Amirul Hakim", "amirul.h@example.com", 69, "Friendly but unsure on the sales scenario.", ["BM"]],
  ["Kavitha Muniandy", "kavitha.m@example.com", 68, "Good attitude; very brief answers.", ["English", "Tamil"]],
  ["Lim Jia Hui", "jiahui.l@example.com", 67, "Soft-spoken; camera off for part of the interview.", ["Mandarin"]],
  ["Nur Izzah", "izzah.n@example.com", 66, "Quiet; struggled with sales scenario.", ["BM"]],
  ["Syafiq Azman", "syafiq.a@example.com", 65, "Answered in BM only; short answers.", ["BM"]],
  ["Grace Wong", "grace.w@example.com", 63, "Prefers back-office work.", ["English"]],
  ["Jessica Ong", "jessica.o@example.com", 61, "Did not finish the last question.", ["English", "Mandarin"]],
  ["Muhammad Danish", "danish.m@example.com", 60, "Available only 3 months.", ["BM"]],
  ["Faiz Kamal", "faiz.k@example.com", 58, "Very short answers.", ["BM"]],
  ["Tan Kok Wei", "kokwei.t@example.com", 57, "Strong accent noise; hard to follow.", ["Mandarin"]],
  ["Nadia Yusof", "nadia.y@example.com", 55, "Looking for part-time only.", ["BM"]],
  ["Priya Devi", "priya.d@example.com", 52, "Audio unclear.", ["Tamil"]],
  ["Vinod Pillai", "vinod.p@example.com", 49, "Skipped two questions.", ["English"]],
  ["Chong Mei Yee", "meiyee.c@example.com", 44, "Interview cut short.", ["Mandarin"]],
];

const NAME_POOL = [
  "Alya Sofea", "Benjamin Teo", "Chandra Segaran", "Dayang Nurul", "Elaine Koh", "Fazrul Hisham", "Gopal Krishnan", "Hannah Lau",
  "Irfan Shah", "Joanne Yap", "Kamal Ariffin", "Lavanya Rao", "Marcus Chua", "Nabila Huda", "Oon Siew Lan", "Puteri Balqis",
  "Qistina Amani", "Rajesh Menon", "Sarah Lim", "Thinesh Kumar", "Umairah Zain", "Vivian Ho", "Wan Haziq", "Yasmin Karim",
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bandOf(score: number, rules: { auto_min: number; review_min: number }) {
  return score >= rules.auto_min ? "hi" : score >= rules.review_min ? "mid" : "lo";
}

/** Raw KitaHQ results for a requisition (before Flow 1b applies bands). */
export function kitahqResults(reqId: string): CastRow[] {
  if (reqId === "REQ-2611-001") return CAST_001;
  let seed = 0;
  for (const ch of reqId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry32(seed);
  const n = 12 + Math.floor(rnd() * 6);
  const pool = [...NAME_POOL].sort(() => rnd() - 0.5).slice(0, n);
  const notes = ["Clear and friendly.", "Confident; good product questions.", "Short answers.", "Strong BM, hesitant in English.", "Warm manner; retail experience.", "Audio unclear in parts.", "Good energy; weekends only."];
  const langs = [["English", "BM"], ["English", "Mandarin"], ["BM"], ["English", "Tamil"], ["English", "BM", "Mandarin"]];
  return pool
    .map((name): CastRow => {
      const score = Math.round(42 + rnd() * 56);
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
      return [name, email, score, notes[Math.floor(rnd() * notes.length)], langs[Math.floor(rnd() * langs.length)]];
    })
    .sort((a, b) => b[2] - a[2]);
}

export function seedCandidates(reqs: Requisition[]): Candidate[] {
  const r = reqs.find((x) => x.id === "REQ-2611-001")!;
  const t = at("2026-11-16 10:16");
  return CAST_001.map(([name, email, score, note, tags, rehire], i) => {
    const band = bandOf(score, { auto_min: 90, review_min: 70 });
    return {
      id: `C-${String(i + 1).padStart(3, "0")}`,
      requisition_id: r.id,
      name,
      email,
      phone: `+60 12-${String(3100000 + i * 7919).slice(0, 3)} ${String(4000 + i * 37).slice(0, 4)}`,
      kitahq_score: score,
      kitahq_note: note,
      band,
      shortlist_source: band === "hi" ? "auto" : undefined,
      status: band === "hi" ? "Shortlisted" : band === "mid" ? "AwaitingHrReview" : "RegretSent",
      status_at: t,
      tags,
      rehire: !!rehire,
      store: r.store,
      opus_job_ids: band === "hi" ? { flow2a: `2a-${i + 1}-${r.id.slice(-3)}` } : {},
      flow2a_started: band === "hi",
    };
  });
}
