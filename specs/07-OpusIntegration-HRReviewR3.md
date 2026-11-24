# 07 · Opus Integration · HR Approval Round 3 (HR final check, last round, Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build. IDs from a real run (§6.2a); questions resolved (§13) |
| **Date** | 2026-11-24 (MYT) |
| **Depends on** | [05 · HR Approval Round 2](05-OpusIntegration-HRReviewR2.md) (HR node with per-node `outputs`, round-aware HR screen, review history), [06 · Hiring Manager Review Round 3](06-OpusIntegration-HMReviewR3.md) (HM resubmit → `WithHr` round 3) |
| **Branch** | `spec-07-hr-review-r3`, created from `main` (specs 02–06 are merged) |
| **Scope** | Backend, Opus Builder setup, the HR task screen (§8) and the Flow 1 stepper for a rejected Opus requisition (§9) |
| **Opus node** | "HR Approval Round 3", an Off-Platform node in the workflow "Valiram - Publish JD" (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`, confirmed) |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

When the hiring manager resubmits at **Hiring Manager Review Round 3** (spec 06 §7.3), the Opus workflow pauses at **HR Approval Round 3** and POSTs the task to the app's webhook. This is the **last review round**. The app:

1. creates a round-3 **Review requisition** task (`HR_JD_CHECK`) for the HR recruiter;
2. keeps the requisition **With HR, round 3** (`WithHr`), which spec 06 already set;
3. shows HR every requisition field, prefilled from the webhook JSON (the HM's round-3 edits included) and editable, plus the review history of rounds 1–3, read only;
4. when HR sends a decision, calls the Opus callback API for the stored `execution_id` with the reviewed JSON, `Pass Status` and HR's message, then:
   - **Approve** → saves the fields, generates the job posting PDF and sets the requisition **Live** (as specs 03 and 05);
   - **Reject** → saves the fields and closes the requisition as **Rejected**. No further round; the hiring manager gets the existing "Requisition rejected after round 3" notice and can copy it to a new requisition.

## 2. Out of scope

- A rejection notification from Opus (email / Slack). The app shows the rejection in its own pages, as the simulator does today.
- A job-posting step in Opus. The app generates the posting itself, as in spec 03 §7.5.
- Copy to a new requisition: already built (`/requisitions/new?copy=<id>`), unchanged.
- Case status polling, notifications, reminders, file inputs and outputs.

## 3. What is different from spec 05

The node has the same shape as **HR Approval Round 2**: one `json_string` input, three outputs (verified JSON, Pass Status, HR message). The IDs, the round and the meaning of `Pass Status = false` change.

| | Spec 05 (HR Approval R2) | This spec (HR Approval R3) |
| :--- | :--- | :--- |
| JSON input | `workflow_input_058aiutmp` | `workflow_input_i7ksgqu03` |
| Reviewed JSON output | `workflow_output_pe8znczzs` ("Reviewed JD Json") | `workflow_output_agrmx0byl` ("Verified JD Json") |
| Pass Status output (`bool`) | `538fe319-3380-4b25-a123-a82a914bdc65`, nullable | `f2e99a70-7962-4d19-92c4-3770bc5c666a`, **not nullable** |
| HR Response Message output (`str`) | `workflow_output_a6harg7au` | `workflow_output_eiqqlyry3` |
| Comes after | HM Review R2 | HM Review R3 |
| Status on receipt | `WithHr` r2 | `WithHr` r3 |
| `Pass Status = false` → | Return: `ReturnedToHm` r3 | **Reject: `Rejected`**, round stays 3 |
| Second decision on screen | "Return to hiring manager" | **"Reject requisition"** |
| History shown | Rounds 1 and 2 | Rounds 1, 2 and 3 |
| Webhook secret | `?secret=` | Header `X-Valiram-Webhook-Secret` (seen on the real run) |

The receiver, secret check, payload schema, idempotency, callback sending, schema check and error handling are the same as in spec 02 §6.1–6.3, §6.5, §7.2 step 3 and §7.3–7.4. JSON parsing, field mapping, the reviewed-JSON reply and the Approve handling are the same as in spec 03 §6.1 step 6a, §6.2, §7.2–7.5 and spec 05. This spec describes only what changes.

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 0 | Node name | **HR Approval Round 3** (the name in Builder and in the audit). |
| 1 | Node input | `workflow_input_i7ksgqu03` (`json_string`), wired from the HM Review Round 3 output `workflow_output_a78p5ndvb`. Confirmed by the real run (§6.2a): the input carried the HM's round-3 edit. |
| 2 | Node outputs | The three outputs in §7.1, as received. |
| 3 | Webhook URL and secret | `https://valiram-hiring-demo.vercel.app/api/opus/webhook?node=hr_review_r3` with the header `X-Valiram-Webhook-Secret: <OPUS_WEBHOOK_SECRET>`. Done; seen on the real run. |
| 4 | Branch on Pass Status | `true` → Job Description Page Generator → Output. `false` → **Output** (the run ends, no job posting). There is no reject node (11 nodes: Input, Normalizer, HM R1, HM JSON Converter, HR R1, HM R2, HR R2, HM R3, HR R3, JD Page Generator, Output). |
| 5 | Timeout | Keep the 15 s default. |
| 6 | Publish the workflow | Then run one test case per decision (§11). |

### 4.2 App configuration

No new variables.

## 5. Node identification

New entry in `OPUS_NODES` (`src/server/app/opusNodes.ts`):

```ts
hr_review_r3: {
  task_type: "HR_JD_CHECK",
  round: 3,
  node_id: "n_hr_verify_r3",          // same stage key pattern as the simulator
  label: "HR Approval Round 3",
  json_input: "workflow_input_i7ksgqu03",
  json_keys: REQ_JSON_KEYS,
  reply: "hr_decision",
  outputs: HR_REVIEW_R3_OUTPUTS,      // §7.1
},
```

`HR_REVIEW_R3_OUTPUTS = { reviewed_json: "workflow_output_agrmx0byl", pass_status: "f2e99a70-7962-4d19-92c4-3770bc5c666a", message: "workflow_output_eiqqlyry3" }`. `buildHrReviewOutput()`, `readInputs()` and `buildPrefill()` are reused unchanged.

## 6. Webhook receiver

### 6.1 Order of steps

Same endpoint and steps as spec 05 §6.1, with these changes:

| # | Step | Change |
| :--- | :--- | :--- |
| 6a | Parse `inputs.workflow_input_i7ksgqu03.value`. | Missing, not valid JSON, or not an object → `422 invalid_json_input`. |
| 8 | Status guard: the requisition should be `WithHr` round 3 (HM resubmitted, spec 06 §7.3). Otherwise log a warning, still create the task, and bring the requisition to `WithHr` round 3 (§6.3). | The existing per-round HR guard (`WithHr` at the node's round for rounds > 1) already covers this. |

### 6.2 JSON input mapping (webhook → app)

Keys inside `workflow_input_i7ksgqu03`: `REQ_JSON_KEYS`, exactly as spec 03 §6.2. Real run: `employment_type` `Full time`, `target_start_date` `DD/MM/YYYY` (`04/01/2027` → 4 Jan 2027). The reply keeps the style received.

### 6.2a Real payload (reference)

Captured from `GET /api/opus/webhook/log` for case REQ-2611-047 (Opus case 83295) at 2026-11-24 10:15 MYT: HM R1 → HR R1 Return → HM R2 → HR R2 Return → HM R3 resubmit (spec 06, live) → this node. The app answered `400 unknown_node` (node not built yet), so the node failed there. `execution_id` `c8847b59-b711-4675-97e2-5dfc1c1d003f`, `workflow_id` `6576e72f-39e0-4e0d-b3e3-38f7ef1c931a` ("Valiram - Publish JD"); `callback` as in spec 02. Headers included `x-valiram-webhook-secret` (masked) and no `?secret=`.

`inputs` as received:

```json
{
  "workflow_input_i7ksgqu03": {
    "type": "json_string",
    "value": "{\"requisition_id\":\"REQ-2611-047\",\"department\":\"Retail Operations\",\"role\":\"Retail Sales Associate\",\"store\":\"Mid Valley Megamall\",\"region\":\"KL City\",\"employment_type\":\"Full time\",\"openings\":2,\"target_start_date\":\"04/01/2027\",\"base_salary_from\":1800,\"base_salary_to\":2300,\"about_the_role\":\"Join our store team as the first point of contact for shoppers, helping them find the right products and enjoy a smooth purchase. You will work closely with the Store Supervisor and your teammates to keep the shop floor welcoming.\",\"what_you_will_do\":\"Greet customers, understand their needs and recommend suitable products\\nProcess sales, returns and exchanges accurately at the point-of-sale system\\nReplenish stock and keep displays neat and on-brand\\nWork towards individual and team sales targets\",\"what_we_look_for\":\"At least 1 year of retail or customer-facing experience\\nGood communication skills in English and Bahasa Malaysia\\nPositive, friendly and team-oriented attitude\",\"benefits\":\"EPF, SOCSO and EIS contributions\\nStaff discount on store products\\nAnnual leave and medical leave as per company policy\",\"shift_pattern\":\"Store open 12pm-7pm. Staff work 12pm-6pm (6 hours) and get 1 rest day each week, chosen by the staff member.\"}"
  }
}
```

Decoded:

```json
{
  "requisition_id": "REQ-2611-047",
  "department": "Retail Operations",
  "role": "Retail Sales Associate",
  "store": "Mid Valley Megamall",
  "region": "KL City",
  "employment_type": "Full time",
  "openings": 2,
  "target_start_date": "04/01/2027",
  "base_salary_from": 1800,
  "base_salary_to": 2300,
  "about_the_role": "Join our store team as the first point of contact for shoppers, helping them find the right products and enjoy a smooth purchase. You will work closely with the Store Supervisor and your teammates to keep the shop floor welcoming.",
  "what_you_will_do": "Greet customers, understand their needs and recommend suitable products\nProcess sales, returns and exchanges accurately at the point-of-sale system\nReplenish stock and keep displays neat and on-brand\nWork towards individual and team sales targets",
  "what_we_look_for": "At least 1 year of retail or customer-facing experience\nGood communication skills in English and Bahasa Malaysia\nPositive, friendly and team-oriented attitude",
  "benefits": "EPF, SOCSO and EIS contributions\nStaff discount on store products\nAnnual leave and medical leave as per company policy",
  "shift_pattern": "Store open 12pm-7pm. Staff work 12pm-6pm (6 hours) and get 1 rest day each week, chosen by the staff member."
}
```

`expected_output_schema` as received:

```json
{
  "workflow_output_agrmx0byl": {
    "type": "json_string",
    "display_name": "Verified JD Json",
    "variable_name": "workflow_output_agrmx0byl",
    "description": "Just reply whole same exact json",
    "is_nullable": true
  },
  "workflow_output_eiqqlyry3": {
    "type": "str",
    "display_name": "HR Response Message",
    "variable_name": "workflow_output_eiqqlyry3",
    "is_nullable": true
  },
  "f2e99a70-7962-4d19-92c4-3770bc5c666a": {
    "type": "bool",
    "display_name": "Pass Status",
    "variable_name": "f2e99a70-7962-4d19-92c4-3770bc5c666a",
    "is_nullable": false
  }
}
```

### 6.3 Task and requisition update

**Task**: as spec 05 §6.3, with `round = 3`, `node_id = "n_hr_verify_r3"`, `inputs.round = 3`, `inputs.node_label = "HR Approval Round 3"`. Assignee = the requisition's `hr_assignee`, else the first `HR_RECRUITER` in Settings.

**Requisition**: `opusHrReceived()` (spec 05) already works for any round > 1, so it is reused unchanged: no field overwrite; `ReturnedToHm` round 3 → `WithHr` round 3 with a warning; activity "Opus paused at HR Approval Round 3; task T-… assigned to <HR>."

## 7. Callback (HR sends a decision)

### 7.1 Output mapping (app → Opus)

`HR_REVIEW_R3_OUTPUTS`:

| Output ID (Opus) | Display name | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_output_agrmx0byl` | Verified JD Json | `json_string` | `buildReviewedJson(source_json, next)`: same keys and formats as the input, unknown keys kept |
| `f2e99a70-7962-4d19-92c4-3770bc5c666a` | Pass Status | `bool` | `true` = Approve, `false` = Reject. **Not nullable**; always sent |
| `workflow_output_eiqqlyry3` | HR Response Message | `str` | HR's comment, trimmed. Required on Reject; `""` when empty on Approve |

Example (Reject):

```json
{
  "output_data": {
    "workflow_output_agrmx0byl": "{\"requisition_id\":\"REQ-2611-047\",…,\"target_start_date\":\"04/01/2027\",…}",
    "f2e99a70-7962-4d19-92c4-3770bc5c666a": false,
    "workflow_output_eiqqlyry3": "The rest day rule is still unclear after three rounds. Closing this requisition; please raise a new one with the final shift pattern."
  },
  "status": "success"
}
```

### 7.2 Building, checking and sending

The screen posts `{ requisition, decision, hr_comments? }`. In round 3 `decision` is `"approve"` or `"reject"`; `"return"` is also accepted and means the same as `"reject"` (so the API body stays the same shape for every round). `"reject"` in round 1 or 2 → `400 invalid` (`field: "decision"`). A comment is required for Reject: "Add a comment explaining why the requisition is rejected." Everything else as spec 05 §7.2.

### 7.3 Requisition after `200`

- **Approve**: `opusHrDecided()` unchanged → **Live** with the posting PDF; review round 3 `outcome = "approved"`. Task label "Approved" / "Approved with edits".
- **Reject**: new branch in `opusHrDecided()` when `round >= MAX_ROUNDS` (3):
  - HR's values saved; review round 3 `hr = { decision: "reject", by, at, comments, edited }`; new version "Edits during HR review" if anything changed.
  - Review round 3 `outcome = "rejected"` (the schema's existing value, as in the seeded rejected requisitions).
  - `status = "Rejected"`, `stage_times.Rejected = now`, `completed_at = now`. `round` stays 3; no new review is added.
  - Activity: "<HR> rejected the requisition (round 3): "<comment>"" and "Not approved after round 3; closed as Rejected. <HM> notified." (the second line matches the simulator's wording).
  - Task: label "Rejected", title "Verified JD · rejected" (the existing simulator labels).
- The hiring manager's **My tasks** shows the existing "Requisition rejected after round 3 · <role>" notice with **Copy to new**; the requisition page shows the existing Rejected alert and **Copy to new requisition** button.

## 8. Task screen (UI change)

`OpusHrReviewTask` for round 3:

| | Round 2 (spec 05) | Round 3 (this spec) |
| :--- | :--- | :--- |
| Chip | "Round 2 of 3" | "Round 3 of 3 · last round" |
| Waiting banner | "…paused at "HR Approval Round 2"…" | "…paused at "HR Approval Round 3"…" (from `inputs.node_label`) |
| History card | Rounds 1 and 2 | Rounds 1, 2 and 3 (round 2 now shows HR's return comment) |
| Second option | "Return to hiring manager" — "They revise; round 3 of 3 follows, the last round. Message required." | **"Reject requisition"** — "This is the last round: the requisition closes as Rejected and nothing is posted. The hiring manager can copy it to a new requisition. Message required." (red) |
| Message label | "HR Response Message (required)" on Return | "HR Response Message (required)" on Reject |
| Result alert | "Returned to <HM> (round 3 of 3 follows, the last round)." | "Requisition rejected after round 3. <HM> was notified and can copy it to a new requisition." |

The screen sends `decision: "reject"` for the round-3 second option.

## 9. Changes to existing behaviour

- `opusHrDecided()`: a not-approved decision in round 3 closes the requisition as **Rejected** instead of opening round 4 (§7.3). Rounds 1 and 2 are unchanged.
- `completeOpusTask()`: accepts `decision: "reject"` in round 3 (and `"return"` as its alias); task labels "Rejected" / "Verified JD · rejected" in round 3.
- Flow 1 stepper (`src/lib/steps.ts`), `Rejected` case: if the last review has no pre-check (Opus path: rounds 2–3 have no AI pre-check), show **AI pre-check** done ("Passed") and **HR verification** failed ("Not approved in round 3"), instead of "Issues in round 3" on the pre-check. The simulator's rejected requisitions (seed REQ-2611-004 / -021) look the same as today.

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/opusNodes.ts` | `hr_review_r3` node; `HR_REVIEW_R3_OUTPUTS`; header comment lists spec 07. |
| `src/server/flows.ts` | `opusHrDecided()`: round-3 Reject → `Rejected` (§7.3). |
| `src/server/service.ts` | `completeOpusTask()`: decision `"reject"` (round 3 only), comment message, round-3 task labels. |
| `src/components/tasks/OpusHrReviewTask.tsx` | Round-3 chip, "Reject requisition" option, helper and result alert (§8). |
| `src/lib/steps.ts` | `Rejected` stepper without a last-round pre-check (§9). |
| `README.md` | `?node=hr_review_r3` in the API table and an "HR Approval Round 3 (spec 07)" paragraph. |

## 11. How to test

1. **Local (mock Opus):** extend the scratchpad `e2e/flow-r3.mjs` to round 3 HR: webhook with the §6.2a body → task r3; Approve → Live with the R3 output IDs; second requisition Reject → Rejected, no new task, HM sees the rejected notice; Reject without comment → 400; `decision: "reject"` on a round-2 task → 400.
2. **End-to-end (real run, production):** two cases with the driver (`e2e/drive-r3.mjs`), each HM R1 → HR R1 Return → HM R2 → HR R2 Return → HM R3 resubmit → this node:
   - **Approve** → requisition **Live**; Opus runs Job Description Page Generator → Output, case **COMPLETED**.
   - **Reject** → requisition **Rejected**; Opus node **COMPLETED** with Pass Status `false`, then Output; case **COMPLETED**, Job Description Page Generator not run.
3. **By API:** `POST /api/tasks/{id}/complete` with `{"output_data": {"requisition": …, "decision": "reject", "hr_comments": "…"}}` (cookie `vh_user=siti`).

## 12. Acceptance criteria

1. When Opus reaches the node, HR gets an open task "Review requisition · <role>", chip "Round 3 of 3 · last round", and the requisition shows **With HR, round 3**.
2. The screen shows all fields prefilled from the JSON (`Full time` → Full-time, `04/01/2027` → 4 Jan 2027) and the review history of rounds 1–3, including HR's round-1 and round-2 return comments.
3. A requisition in `ReturnedToHm` round 3 when the webhook arrives still gets the task and moves to **With HR, round 3**, with a warning logged.
4. An input that isn't valid JSON, or has no known `requisition_id` → `422`, nothing created. Secret (header or `?secret=`), node, body and workflow checks behave as in spec 02.
5. The same payload sent twice creates one task.
6. **Approve**: Opus receives exactly `workflow_output_agrmx0byl`, `f2e99a70-7962-4d19-92c4-3770bc5c666a` (`true`) and `workflow_output_eiqqlyry3`; without edits the JSON has the same values and formats as received. After `200` the requisition is **Live** with a job posting PDF.
7. **Reject** without a comment shows a field error and calls nothing. With a comment: Pass Status `false`, message = the comment; after `200` the requisition is **Rejected** (round 3, `completed_at` set), no new task is created, the HM sees "Requisition rejected after round 3" with **Copy to new**, and the stepper shows HR verification failed.
8. If the callback fails (network error, `422`, timeout), the requisition stays **With HR, round 3** and the task stays open; a spent token closes the task with the existing message.
9. Round-1 and round-2 HR tasks still send their own output IDs and still Return to the next round; `decision: "reject"` there → `400`.
10. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log.
11. Spec 02–06 tasks and simulator tasks (including the seeded rejected requisitions) work as before.
12. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | What Opus does after Pass Status `false` in round 3 | Goes straight to **Output**; the case ends COMPLETED without a job posting (user, 2026-11-24). The app closes the requisition as Rejected after `200`. |
| 2 | Wording of the second decision in round 3 | **"Reject requisition"** (red; closes it), as the simulator's round-3 HR screen does (user, 2026-11-24). |
| 3 | IDs and nullability | Taken from the real webhook of REQ-2611-047 (case 83295) on 2026-11-24: input `workflow_input_i7ksgqu03`; outputs `workflow_output_agrmx0byl` (nullable), `workflow_output_eiqqlyry3` (nullable), Pass Status `f2e99a70-7962-4d19-92c4-3770bc5c666a` (**not nullable**). `workflow_input_i7ksgqu03` is the input that showed up null in the spec 04 run; it belongs to this node. |
| 4 | `workflow_id` of the payload | The same "Valiram - Publish JD" workflow; the existing `wrong_workflow` check applies. |
| 5 | Format of the reviewed JSON | Same keys and formats as this node's input, unknown keys kept, as the output description asks. |
| 6 | After Approve | The app generates the posting PDF and sets **Live** at once; no Opus posting node. |
| 7 | After Reject | **Rejected**, round 3, `completed_at` set; HR's edits saved. No Opus rejection node or notification (§2). |
| 8 | HR assignee | The requisition's `hr_assignee`, else the first HR recruiter in Settings. |
| 9 | Requisition not `WithHr` round 3 on receipt | Task created anyway; requisition brought to `WithHr` round 3, as spec 05 §13 #10. |
| 10 | API decision value in round 3 | `"reject"`, with `"return"` accepted as an alias; `"reject"` refused in rounds 1–2. |
