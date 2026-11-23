# 05 · Opus Integration · HR Approval Round 2 (HR final check, Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build. IDs to be re-checked against a real run (§13 #2) |
| **Date** | 2026-11-23 (MYT) |
| **Depends on** | [03 · HR Review Round 1](03-OpusIntegration-HRReviewR1.md) (HR screen, decision, reviewed JSON, Approve → Live, Return → next round), [04 · Hiring Manager Review Round 2](04-OpusIntegration-HMReviewR2.md) (HM resubmit → `WithHr` round 2, `OpusNode.reply`, `opusNodeById()`) |
| **Branch** | `spec-05-hr-review-r2`, created from `main` (specs 02–04 are merged) |
| **Scope** | Backend, Opus Builder setup, and a small change to the HR task screen (§8) |
| **Opus node** | "HR Approval Round 2", an Off-Platform node in the workflow "Valiram - Publish JD" (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`, confirmed) |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

When the hiring manager resubmits at **Hiring Manager Review Round 2** (spec 04 §7.4), the Opus workflow pauses at **HR Approval Round 2** and POSTs the task to the app's webhook. The app:

1. creates a round-2 **Review requisition** task (`HR_JD_CHECK`) for the HR recruiter;
2. keeps the requisition **With HR, round 2** (`WithHr`), which spec 04 already set;
3. shows HR every requisition field, prefilled from the webhook JSON (the HM's round-2 edits included) and editable, plus the review history of rounds 1 and 2, read only;
4. when HR sends a decision, calls the Opus callback API for the stored `execution_id` with the reviewed JSON, `Pass Status` and HR's message, then:
   - **Approve** → saves the fields, generates the job posting PDF and sets the requisition **Live** (as spec 03);
   - **Return** → saves the fields and sets the requisition **Returned to HM, round 3**. The round-3 HM task arrives through a later webhook.

## 2. Out of scope

- Hiring Manager Review Round 3, HR final check round 3 and the round-3 rejection (later specs, with their real IDs).
- A job-posting step in Opus. The app generates the posting itself, as in spec 03 §7.5.
- Case status polling, notifications, reminders, file inputs and outputs.

## 3. What is different from spec 03

The node has the same shape as **Round 1 · HR final check**: one `json_string` input, three outputs (reviewed JSON, Pass Status, HR message). Only the IDs, the round and the status around it change.

| | Spec 03 (HR final check R1) | This spec (HR final check R2) |
| :--- | :--- | :--- |
| JSON input | `workflow_input_5x656gas6` | `workflow_input_ualqh69xi` |
| Reviewed JSON output | `workflow_output_84zgk25bn` | `workflow_output_pe8znczzs` |
| Pass Status output | `6bd09ad2-306d-4a2f-bc89-46e35d2650a2` | `6710c073-3492-4833-b21e-dbbeaa48339f` |
| HR Response Message output | `workflow_output_1ldrqy5bs` | `workflow_output_a6harg7au` |
| Comes after | AI pre-check passed, or HM Review R1 | HM Review R2 |
| Status on receipt | `WithHr` r1 or `AiPrecheck` r1 | `WithHr` r2 |
| Return → | `ReturnedToHm` r2 | `ReturnedToHm` r3 (last round) |
| History shown | Round 1 | Rounds 1 and 2 |

The receiver, secret check, payload schema, idempotency, callback sending, schema check and error handling are the same as in spec 02 §6.1–6.3, §6.5, §7.2 step 3 and §7.3–7.4. JSON parsing, field mapping, the reviewed-JSON reply, the decision checks and the Approve / Return handling are the same as in spec 03 §6.1 step 6a, §6.2, §7.2–7.6. This spec describes only what changes.

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 0 | Node name | **HR Approval Round 2** (the name in Builder). |
| 1 | Node input | `workflow_input_ualqh69xi` (`json_string`) with the keys in §6.2, `requisition_id` included. Already in the sample. |
| 2 | Node outputs | The three outputs in §7.1, all nullable, as in the sample. |
| 3 | Webhook URL | `https://<app-domain>/api/opus/webhook?node=hr_review_r2&secret=<OPUS_WEBHOOK_SECRET>`; on a preview URL also `&x-vercel-protection-bypass=<secret>` (spec 02 §4.1 steps 5–6a). Type a plain `&`, not `&amp;` (spec 04 §13 #10). |
| 4 | Input wiring | `workflow_input_ualqh69xi` must come from the HM Review Round 2 output `workflow_output_0256au6te` (Updated Json), so HR sees the HM's round-2 edits. |
| 5 | Timeout | Keep the 15 s default. |
| 6 | Publish the workflow | Then replay or run one test case (§11). |

### 4.2 App configuration

No new variables. Uses `OPUS_WEBHOOK_SECRET`, `OPUS_SERVICE_KEY`, `OPUS_CREATE_REQUISITION_WORKFLOW_ID` and the Upstash store as in spec 02 §4.2.

## 5. Node identification

New entry in `OPUS_NODES` (`src/server/app/opusNodes.ts`):

```ts
hr_review_r2: {
  task_type: "HR_JD_CHECK",
  round: 2,
  node_id: "n_hr_verify_r2",          // same stage key as the simulator, so the stepper and node_map work
  label: "HR Approval Round 2",
  json_input: "workflow_input_ualqh69xi",
  json_keys: REQ_JSON_KEYS,           // same keys as spec 03 §6.2
  reply: "hr_decision",
  outputs: HR_REVIEW_R2_OUTPUTS,      // §7.1
},
```

- Today `buildHrReviewOutput()` uses the constant `HR_REVIEW_OUTPUTS` (round 1 IDs). The output IDs move onto the node: new optional `OpusNode.outputs` (`{ reviewed_json, pass_status, message }`), set on `hr_review_r1` (`HR_REVIEW_R1_OUTPUTS`, the current values, renamed) and `hr_review_r2` (`HR_REVIEW_R2_OUTPUTS`).
- `buildHrReviewOutput(outputs, source_json, r, approve, message)` takes the node's output IDs. `completeOpusTask()` passes `opusNodeById(t.node_id).outputs`; an `hr_decision` node without `outputs` is a code error (`500`).
- `readInputs()` and `buildPrefill()` are reused unchanged.

## 6. Webhook receiver

### 6.1 Order of steps

Same endpoint and steps as spec 03 §6.1, with these changes:

| # | Step | Change |
| :--- | :--- | :--- |
| 6a | Parse `inputs.workflow_input_ualqh69xi.value` (JSON string; an object is also accepted). | Missing, not valid JSON, or not an object → `422 invalid_json_input`. |
| 6 | `requisition_id` is read **from inside the JSON**. | Same `422 unknown_requisition` rule. |
| 8 | Status guard: the requisition should be `WithHr` round 2 (HM resubmitted, spec 04 §7.4). Otherwise log a warning, still create the task, and bring the requisition to `WithHr` round 2 (§6.3). | Today the HR guard accepts `WithHr` or `AiPrecheck` for any HR node; `AiPrecheck` becomes round-1 only. |

### 6.2 JSON input mapping (webhook → app)

Keys inside `workflow_input_ualqh69xi`: `REQ_JSON_KEYS`, exactly as spec 03 §6.2 (`requisition_id`, `department`, `role`, `store` → `store_id` by name, `region`, `employment_type`, `openings`, `target_start_date`, `base_salary_from`, `base_salary_to`, `about_the_role`, `what_you_will_do`, `what_we_look_for`, `benefits`, `shift_pattern`).

- `employment_type`: `Full-time` in the sample; `Full time` is also accepted (spec 04 saw it in a real run).
- `target_start_date`: `DD-MM-YYYY` in the sample (`17-11-2026` → 17 Nov 2026); `DD/MM/YYYY` and `YYYY-MM-DD` also accepted.
- Missing or unreadable fields fall back to the requisition with a warning; values that don't match Settings go to `inputs.unmatched`; unknown keys are kept in `source_json` and sent back unchanged.

Sample `inputs` as supplied (2026-11-23):

```json
{
  "workflow_input_ualqh69xi": {
    "type": "json_string",
    "value": "{\"department\": \"Retail Operations\", \"role\": \"Retail Sales Associate\", \"store\": \"Mid Valley Megamall\", \"region\": \"KL City\", \"employment_type\": \"Full-time\", \"openings\": 2, \"target_start_date\": \"17-11-2026\", \"base_salary_from\": 1800, \"base_salary_to\": 2300, \"about_the_role\": \"Join our store team as the first point of contact for shoppers, ...\", \"what_you_will_do\": \"Greet customers, understand their needs and recommend suitable products\\nProcess sales, returns and exchanges accurately at the point-of-sale system\\n...\", \"what_we_look_for\": \"At least 1 year of retail or customer-facing experience (fresh graduates with strong attitude are welcome to apply)\\n...\", \"benefits\": \"EPF, SOCSO and EIS contributions\\n...\\nFree uniform\", \"shift_pattern\": \"Store open 12pm-7pm.. Staff works 12pm-6pm 6 hours. Staff will awarded 1 day off each week, can choose specific day.\", \"requisition_id\": \"REQ-2611-018\"}"
  }
}
```

Decoded:

```json
{
  "department": "Retail Operations",
  "role": "Retail Sales Associate",
  "store": "Mid Valley Megamall",
  "region": "KL City",
  "employment_type": "Full-time",
  "openings": 2,
  "target_start_date": "17-11-2026",
  "base_salary_from": 1800,
  "base_salary_to": 2300,
  "about_the_role": "Join our store team as the first point of contact for shoppers, helping them find the right products and enjoy a smooth purchase. You will work closely with the Store Supervisor and your teammates to keep the shop floor welcoming, well stocked and sales-ready. This is a hands-on role suited to someone who enjoys talking to people and thrives in a busy retail setting.",
  "what_you_will_do": "Greet customers, understand their needs and recommend suitable products\nProcess sales, returns and exchanges accurately at the point-of-sale system\nReplenish stock, maintain visual merchandising and keep displays neat and on-brand\nSupport stock counts, receiving of deliveries and price or promotion changes\nWork towards individual and team sales targets\nHandle customer questions and feedback politely, escalating issues to the supervisor when needed",
  "what_we_look_for": "At least 1 year of retail or customer-facing experience (fresh graduates with strong attitude are welcome to apply)\nGood communication skills in English and Bahasa Malaysia; Mandarin is an advantage\nComfortable using a POS system and basic mobile or tablet apps\nPositive, friendly and team-oriented attitude\nAble to stand for long periods and handle light lifting of stock\nAvailable to work weekends, public holidays and mall promotional periods",
  "benefits": "EPF, SOCSO and EIS contributions\nStaff discount on store products\nPerformance-based monthly sales incentive and commission\nAnnual leave, medical leave and public holidays as per company policy\nMedical and insurance coverage after probation\nPaid training and clear career path to Senior Sales Associate and Supervisor\nFree uniform",
  "shift_pattern": "Store open 12pm-7pm.. Staff works 12pm-6pm 6 hours. Staff will awarded 1 day off each week, can choose specific day.",
  "requisition_id": "REQ-2611-018"
}
```

`expected_output_schema` as supplied:

```json
{
  "workflow_output_pe8znczzs": {
    "type": "json_string",
    "display_name": "Reviewed JD Json",
    "variable_name": "workflow_output_pe8znczzs",
    "description": "Just reply whole same exact json",
    "is_nullable": true
  },
  "6710c073-3492-4833-b21e-dbbeaa48339f": {
    "type": "bool",
    "display_name": "Pass Status",
    "variable_name": "6710c073-3492-4833-b21e-dbbeaa48339f",
    "description": "Indicates whether the externally dispatched task completed successfully according to the callback response.",
    "is_nullable": true
  },
  "workflow_output_a6harg7au": {
    "type": "str",
    "display_name": "HR Response Message",
    "variable_name": "workflow_output_a6harg7au",
    "is_nullable": true
  }
}
```

### 6.3 Task and requisition update

**Task**: as spec 03 §6.3, with `round = 2` and `node_id = "n_hr_verify_r2"`. Assignee = the requisition's `hr_assignee` (the recruiter who returned it in round 1), else the first `HR_RECRUITER` in Settings. Title `Review requisition · <role>`. `inputs.prefill`, `inputs.unmatched`, `inputs.source_json`, `inputs.requisition_id`, `inputs.round = 2`, new `inputs.node_label = "HR Approval Round 2"` (the node's `label`, also set for round 1 from now on), `source = "opus"`. `execution_id` is appended to `db.opus_cases[id].execution_ids`.

**Requisition**: `opusHrReceived()` (spec 03) gets the round-2 case:

- Fields are **not** overwritten from the payload.
- If already `WithHr` round 2 (normal path): no status change.
- If `ReturnedToHm` round 2 (the app missed the HM's `200`, or the HM step was completed outside the app): review round 2 `hm = { by: <hm_name>, at: now }` if missing, status `WithHr`, `stage_times.WithHr = now`, activity "Opus moved the requisition to HR (round 2)."
- `AiPrecheck` is handled only for round 1, as today.
- Activity: "Opus paused at HR Approval Round 2; task T-… assigned to <HR>."

## 7. Callback (HR sends a decision)

### 7.1 Output mapping (app → Opus)

`HR_REVIEW_R2_OUTPUTS`:

| Output ID (Opus) | Display name | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_output_pe8znczzs` | Reviewed JD Json | `json_string` | `buildReviewedJson(source_json, next)`: same keys and formats as the input (spec 03 §7.2), unknown keys kept |
| `6710c073-3492-4833-b21e-dbbeaa48339f` | Pass Status | `bool` | `true` = Approve, `false` = Return to hiring manager |
| `workflow_output_a6harg7au` | HR Response Message | `str` | HR's comment, trimmed. Required on Return; `""` when empty on Approve |

Values are bare. The `json_string` output is a **string** containing JSON. All three are nullable, but the app always sends all three.

Example (Return):

```json
{
  "output_data": {
    "workflow_output_pe8znczzs": "{\"department\":\"Retail Operations\",\"role\":\"Retail Sales Associate\",\"store\":\"Mid Valley Megamall\",\"region\":\"KL City\",\"employment_type\":\"Full-time\",\"openings\":2,\"target_start_date\":\"17-11-2026\",\"base_salary_from\":1800,\"base_salary_to\":2300,\"about_the_role\":\"…\",\"what_you_will_do\":\"…\\n…\",\"what_we_look_for\":\"…\\n…\",\"benefits\":\"…\",\"shift_pattern\":\"Store open 12pm-7pm…\",\"requisition_id\":\"REQ-2611-018\"}",
    "6710c073-3492-4833-b21e-dbbeaa48339f": false,
    "workflow_output_a6harg7au": "The shift pattern still has a typo (\"12pm-7pm..\") and \"Staff will awarded\". Please fix the wording; this is the last review round."
  },
  "status": "success"
}
```

### 7.2 Building, checking and sending

Same as spec 03 §7.3: the screen posts `{ requisition, decision, hr_comments? }`; decision and comment checks; `RequisitionInputSchema` and department / role / store checks; outputs built from the **node's** output IDs (§5); keys checked against the task's `expected_output_schema` (`500 opus_schema_mismatch`); `sendCallback()`. Responses `401` / `404` / `422` / `502` / `504` as spec 02 §7.4. The requisition and task change **only after Opus answers `200`**.

### 7.3 Requisition after `200`

`opusHrDecided()` (spec 03 §7.4–7.6) already works on the current round, so it is reused unchanged:

- Both decisions: HR's values saved; review round 2 `hr = { decision, by, at, comments, edited }`; new version "Edits during HR review" if anything changed.
- **Approve**: review round 2 `outcome = "approved"`, latest version `published`, `JobPosting` → `Live` with the posting PDF in the same request. Task label "Approved" / "Approved with edits".
- **Return**: review round 2 `outcome = "returned"`, `round = 3`, new review `{ round: 3, outcome: "pending" }`, status `ReturnedToHm`. Activity "<HR> returned the requisition to <HM> (round 2): "<comment>"". No task; the HM round-3 task comes from the "Hiring Manager Review Round 3" webhook (later spec). Task label "Returned".

The Presenter **Advance** action keeps refusing Opus-driven requisitions (`409 opus_driven`).

## 8. Task screen (UI change)

`/tasks/[id]` already routes an `HR_JD_CHECK` task with `inputs.prefill` to `OpusHrReviewTask`. Round-aware changes:

| | Round 1 (spec 03) | Round 2 (this spec) |
| :--- | :--- | :--- |
| Chip | "Round 1 of 3" | "Round 2 of 3" |
| Waiting banner | "…paused at "Round 1 · HR final check"…" | "…paused at "HR Approval Round 2"…" (from `inputs.node_label`) |
| History card | "Round 1 history": AI pre-check, HM resubmit | **"Review history"**: one block per earlier round, oldest first. Round 1: AI pre-check (if any), HM resubmit, **HR's return comment** (who, when MYT). Round 2: HM resubmit (who, when MYT) |
| Return option helper | "They revise; round 2 of 3 follows. Message required." | "They revise; round 3 of 3 follows, the last round. Message required." |
| Return result alert | "Returned to <HM> (round 2 of 3 follows)." | "Returned to <HM> (round 3 of 3 follows, the last round)." |

Fields, decision radio, HR Response Message, the **Send decision to Opus** button and the error handling are unchanged. The history card shows every review with `round ≤ task.round`, so round 1 also works as before.

## 9. Changes to existing behaviour

- `HR_REVIEW_OUTPUTS` → `HR_REVIEW_R1_OUTPUTS` and set on the `hr_review_r1` node; `buildHrReviewOutput()` takes the output IDs from the node. Spec 03 output values are unchanged.
- The receiver's HR status guard becomes per round: round 1 → `WithHr` / `AiPrecheck` r1; round 2 → `WithHr` r2.
- `opusHrReceived()` brings a `ReturnedToHm` round-2 requisition to `WithHr` (§6.3).
- The HR screen's history card covers all earlier rounds (§8).

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/opusNodes.ts` | `hr_review_r2` node; `OpusNode.outputs`; `HR_REVIEW_R1_OUTPUTS` (rename) and `HR_REVIEW_R2_OUTPUTS`; `buildHrReviewOutput()` takes the output IDs. |
| `src/server/app/webhook.ts` | HR status guard per round (§6.1 step 8); `inputs.node_label` on HR tasks (§6.3). |
| `src/server/flows.ts` | `opusHrReceived()`: `ReturnedToHm` round 2 → `WithHr` (§6.3). |
| `src/server/service.ts` | `completeOpusTask()` passes the node's `outputs` to `buildHrReviewOutput()`. |
| `src/components/tasks/OpusHrReviewTask.tsx` | Banner uses `inputs.node_label` (fallback "Round N · HR final check" for older tasks); round-aware helper and result text; history card for all earlier rounds (§8). |
| `README.md` | Node URL and the `hr_review_r2` row in the Opus nodes table. |

## 11. How to test

1. **Replayed payload:** save the §6.2 `inputs` + `expected_output_schema`, plus `execution_id`, `workflow_id`, `workflow_name` and a `callback` block, as `sample-hr-review-r2.json`, with `requisition_id` set to a requisition that has an `opus_cases` entry and is `WithHr` round 2 (finish the spec 04 flow). Then:
   `curl -X POST "https://<preview>/api/opus/webhook?node=hr_review_r2&secret=…" -H "content-type: application/json" --data @sample-hr-review-r2.json`
   Check the HR screen. The callback goes to Opus with a spent token, which tests the `401` path.
2. **End-to-end (real run):** a requisition whose JD fails the AI pre-check → HM Review R1 resubmit → HR R1 **Return** → HM Review R2 resubmit → this node. Try **Approve** (requisition **Live**, Opus run finishes) and, in a second run, **Return** (requisition **Returned to HM, round 3**, Opus moves to HM Review Round 3). `GET /api/opus/webhook/log` (HR user) shows the received body with the token masked.
3. **By API:** `POST /api/tasks/{id}/complete` with `{"output_data": {"requisition": …, "decision": "approve"}}` (cookie `vh_user=siti`).

## 12. Acceptance criteria

1. When Opus reaches the node, HR gets an open task "Review requisition · <role>", chip "Round 2 of 3", and the requisition shows **With HR, round 2**.
2. The screen shows all fields prefilled from the JSON (`Full-time` → Full-time, `17-11-2026` → 17 Nov 2026, store name matched) and the review history of rounds 1 and 2 read only, including HR's round-1 return comment.
3. A requisition in `ReturnedToHm` round 2 when the webhook arrives still gets the task, moves to **With HR, round 2**, and a warning is logged.
4. An input that isn't valid JSON, or has no known `requisition_id` → `422`, nothing created. Secret, node, body and workflow checks behave as in spec 02.
5. The same payload sent twice creates one task.
6. **Approve**: Opus receives exactly `workflow_output_pe8znczzs`, `6710c073-3492-4833-b21e-dbbeaa48339f` (`true`) and `workflow_output_a6harg7au`; without edits the JSON has the same values and formats as received. After `200` the requisition is **Live** with a job posting PDF; history shows round 2 "Approved" / "Approved with edits".
7. **Return** without a comment shows a field error and calls nothing. With a comment: Pass Status `false`, message = the comment; after `200` the requisition is **Returned to HM, round 3**, with no new task.
8. If the callback fails (network error, `422`, timeout), the requisition stays **With HR, round 2** and the task stays open; a spent token closes the task with the existing message.
9. Round-1 HR tasks still send the spec 03 output IDs (`workflow_output_84zgk25bn`, `6bd09ad2-…`, `workflow_output_1ldrqy5bs`).
10. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log.
11. Spec 02–04 tasks and simulator tasks work as before.
12. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | Node name | "HR Approval Round 2", in Builder and in the app (node label, activity, waiting banner). The stepper stage label is unchanged (Settings `node_map`). |
| 2 | Sample source | The supplied sample (2026-11-23) has `REQ-2611-018` and the round-1 JD text, so it looks hand-built from spec 03's sample. Build from it now; when a real run reaches this node, check its payload in `/api/opus/webhook/log` and update the IDs, nullability and formats in this spec and `opusNodes.ts` if they differ, as done for spec 04. |
| 3 | `workflow_id` of the payload | The same "Valiram - Publish JD" workflow (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`); the existing `wrong_workflow` check applies. |
| 4 | Output IDs | Per node (`OpusNode.outputs`), not one shared constant, because round 2 has its own IDs. |
| 5 | Pass Status | `true` = Approve, `false` = Return, as spec 03. The workflow branches on it. |
| 6 | Format of the reviewed JSON | Same keys and formats as this node's input, unknown keys kept, as the output description asks. |
| 7 | After Approve | The app generates the posting PDF and sets **Live** at once; no Opus posting node. |
| 8 | After Return | **Returned to HM, round 3**, with no task until the HM Review Round 3 webhook (later spec). HR's edits are saved, as in spec 03. |
| 9 | HR assignee | The requisition's `hr_assignee` (same recruiter as round 1), else the first HR recruiter in Settings. |
| 10 | Requisition not `WithHr` round 2 on receipt | Task created anyway; requisition brought to `WithHr` round 2 (Opus is the source of truth), as spec 04 §13 #7. |
