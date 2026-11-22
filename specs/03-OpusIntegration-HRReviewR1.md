# 03 · Opus Integration · HR Review Round 1 (HR final check, Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build |
| **Date** | 2026-11-22 (MYT) |
| **Depends on** | [02 · Hiring Manager Review Round 1](02-OpusIntegration-HmReviewR1.md) (webhook receiver, callback sender, `OPUS_NODES`, shared form fields) |
| **Branch** | `spec-03-hr-review-r1`, created from `spec-02-hm-review-r1` (stacked; merge spec 02 first) |
| **Scope** | Backend, Opus Builder setup, and the HR task screen (§8) |
| **Opus node** | "Round 1 · HR final check", an Off-Platform node in the workflow "Valiram - Publish JD" (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`, confirmed) |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

After round 1 (the AI pre-check passed, or the hiring manager resubmitted in spec 02), the Opus workflow pauses at **Round 1 · HR final check** and POSTs the task to the app's webhook. The app:

1. creates a round-1 **Review requisition** task (`HR_JD_CHECK`) for the HR recruiter;
2. keeps the requisition **With HR** (`WithHr`, round 1);
3. shows HR every requisition field, prefilled from the webhook and editable, plus the round-1 review history read only;
4. when HR sends a decision, calls the Opus callback API for the stored `execution_id` with the reviewed requisition JSON, a pass flag and HR's message, then:
   - **Approve** → saves the fields, generates the job posting PDF and sets the requisition **Live**;
   - **Return** → saves the fields and sets the requisition **Returned to HM, round 2**. The round-2 HM task arrives through a later webhook.

## 2. Out of scope

- Hiring Manager Review rounds 2 and 3, HR final check rounds 2 and 3, and the round-3 rejection.
- A job-posting step in Opus. The app generates the posting itself (§7.5).
- Flow 1b (screening, shortlist) for Opus-backed requisitions.
- Case status polling, notifications, reminders, file inputs and outputs.
- The Opus delivery problem on the Vercel URL (spec 02 testing). This node uses the same receiver, so it is tested with replayed payloads (§11) until Opus fixes delivery.

## 3. What is different from spec 02

| | Spec 02 (HM Review R1) | This spec (HR final check R1) |
| :--- | :--- | :--- |
| Inputs | 16 flat inputs, one per field | **One** input `workflow_input_5x656gas6` of type `json_string`: a JSON object with all fields, including `requisition_id` |
| Outputs | 14 bare values | **Three** outputs: the reviewed JSON (`json_string`), a pass flag (`bool`) and a message (`str`) |
| Employment type / date in | `Full time`, `DD/MM/YYYY` | `Full-time`, `DD-MM-YYYY` |
| Message from Opus | "Message to Hiring Manager" | None |
| Who acts | Hiring manager | HR recruiter |

The receiver, secret check, payload schema, idempotency, callback sending and error handling are the same as in spec 02 §6.1–6.3, §6.5 and §7.3–7.4. This spec describes only what changes.

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 1 | Node input | `workflow_input_5x656gas6` (`json_string`) with the keys in §6.2, `requisition_id` included. Already in the sample. |
| 2 | Node outputs | The three outputs in §7.1, all nullable, as in the sample. |
| 3 | Output `workflow_output_1ldrqy5bs` | Fix its `variable_name` in Builder: the sample has `workflow_output_1bxkc7tyo`, which is a mistake. Key and `variable_name` must both be `workflow_output_1ldrqy5bs` (§13 #3). |
| 4 | Webhook URL | `https://<app-domain>/api/opus/webhook?node=hr_review_r1&secret=<OPUS_WEBHOOK_SECRET>`; on a preview URL also `&x-vercel-protection-bypass=<secret>` (spec 02 §4.1 steps 5–6a). |
| 5 | Timeout | Keep the 15 s default. |
| 6 | Publish the workflow | Then replay or run one test case (§11). |

### 4.2 App configuration

No new variables. Uses `OPUS_WEBHOOK_SECRET`, `OPUS_SERVICE_KEY`, `OPUS_CREATE_REQUISITION_WORKFLOW_ID` and the Upstash store as in spec 02 §4.2.

## 5. Node identification

New entry in `OPUS_NODES` (`src/server/app/opusNodes.ts`):

```ts
hr_review_r1: {
  task_type: "HR_JD_CHECK",
  round: 1,
  node_id: "n_hr_verify_r1",       // same stage key as the simulator, so the stepper and node_map work
  label: "Round 1 · HR final check",
  json_input: "workflow_input_5x656gas6",
  json_keys: HR_REVIEW_JSON_KEYS,  // §6.2
},
```

`OpusNode` gets an optional `json_input` + `json_keys` instead of the flat `inputs` map. `readInputs()` reads either shape and returns the same `ReadInputs` (`requisition_id`, `message`, `values`), so `buildPrefill()` is reused unchanged. `message` is `""` for this node.

## 6. Webhook receiver

### 6.1 Order of steps

Same endpoint and steps as spec 02 §6.2, with these changes:

| # | Step | Change |
| :--- | :--- | :--- |
| 6a | **New:** parse `inputs.workflow_input_5x656gas6.value`. It is a JSON string; an object is also accepted. | Missing, not valid JSON, or not an object → `422 invalid_json_input` (the step fails in Opus at once; a resend wouldn't fix it). |
| 6 | `requisition_id` is read **from inside the JSON**. | Same `422 unknown_requisition` rule. |
| 8 | Status guard: the requisition should be `WithHr` round 1 (after the HM resubmitted) or `AiPrecheck` round 1 (pre-check passed, no HM review). Otherwise log a warning and still create the task. | – |

### 6.2 JSON input mapping (webhook → app)

Keys inside `workflow_input_5x656gas6`:

| JSON key | Label (front end) | App field | Rule |
| :--- | :--- | :--- | :--- |
| `requisition_id` | Requisition ID | lookup key | Required |
| `department` | Department | `department` | |
| `role` | Role | `role` | |
| `store` | Store | `store_id` | Store **name** → `store_id` via Settings (case-insensitive) |
| `region` | Region | `region` | Shown only; derived from the store |
| `employment_type` | Employment type | `employment_type` | `Full-time` / `Part-time` (also accepts `Full time`) |
| `openings` | Openings | `openings` | Integer |
| `target_start_date` | Target Start Date | `target_start` | `DD-MM-YYYY` → `YYYY-MM-DD` (also accepts `DD/MM/YYYY`, `YYYY-MM-DD`) |
| `base_salary_from` | Base salary from | `base_min` | Number |
| `base_salary_to` | Base salary to | `base_max` | Number |
| `about_the_role` | About the role | `jd.about` | |
| `what_you_will_do` | What you will do | `jd.duties` | Split on `\n`, trimmed, blank lines removed |
| `what_we_look_for` | What we look for | `jd.requirements` | As above |
| `benefits` | Benefits | `jd.benefits` | Text, line breaks kept |
| `shift_pattern` | Shift pattern | `jd.shift_pattern` | Text, line breaks kept |

- The existing parsers (`parseEmploymentType`, `parseOpusDate`, `buildPrefill`) already accept these formats.
- Missing or unreadable fields fall back to the requisition, with a warning, as in spec 02.
- Keys the app doesn't know are kept in the stored JSON (§6.3) and sent back unchanged (§7.1).
- The map lives in one constant, `HR_REVIEW_JSON_KEYS` (JSON key → app field).

Sample (decoded):

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
  "about_the_role": "Join our store team…",
  "what_you_will_do": "Greet customers…\nProcess sales…",
  "what_we_look_for": "At least 1 year…\nGood communication…",
  "benefits": "EPF, SOCSO and EIS contributions\n…",
  "shift_pattern": "Store open 12pm-7pm.. Staff works 12pm-6pm 6 hours…",
  "requisition_id": "REQ-2611-018"
}
```

### 6.3 Task and requisition update

`receiveOpusTask()` handles both nodes; the parts that differ by task type move into small per-node functions.

**Task** (assignee = the requisition's `hr_assignee`, else the first `HR_RECRUITER` in Settings, which is then saved as `hr_assignee` / `hr_name`, as the simulator does; title `Review requisition · <role>`):

| Field | Value |
| :--- | :--- |
| `task_type`, `round`, `node_id` | From `OPUS_NODES.hr_review_r1` |
| `execution_id`, `workflow_id`, `workflow_name`, `callback`, `expected_output_schema` | As in spec 02 §6.6 (`callback` server-side only) |
| `inputs.prefill` | Mapped values (§6.2) as a `RequisitionInput` |
| `inputs.unmatched` | Values that don't match Settings (department, role, store) |
| `inputs.source_json` | The decoded JSON object as received. Used to build the reply (§7.1) |
| `inputs.requisition_id`, `inputs.round` | REQ ID, `1` |
| `source` | `"opus"` |

`execution_id` is also appended to `db.opus_cases[id].execution_ids`, as in spec 02.

**Requisition:**

- Fields are **not** overwritten from the payload.
- If the status is `AiPrecheck`: review round 1 gets `precheck = { pass: true, at: now, findings: [] }`, status `WithHr`, `stage_times.WithHr = now`, activity "AI pre-check round 1 passed."
- If already `WithHr`: no status change.
- Activity: "Opus paused at Round 1 · HR final check; task T-… assigned to <HR>."

## 7. Callback (HR sends a decision)

### 7.1 Output mapping (app → Opus)

| Output ID (Opus) | Display name | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_output_84zgk25bn` | Reviewed JD Json | `json_string` | `JSON.stringify` of the reviewed requisition in the **same keys and formats as the input** (§7.2). Real runs send `Full time` and `DD/MM/YYYY`; the first sample had `Full-time` and `DD-MM-YYYY` |
| `b52a7030-aba8-4467-a433-e05c4633166c` | Pass Status | `bool` | `true` = Approve, `false` = Return to hiring manager |
| `725b0463-f2cb-4629-af87-635cffe5560d` | Pass Status (second, **not nullable**) | `bool` | Same value as above. Added in Builder on 2026-11-23; without it the app refuses to send (`opus_schema_mismatch`) |
| `workflow_output_1ldrqy5bs` | HR Response Message | `str` | HR's comment, trimmed. Required on Return; `""` when empty on Approve |

Values are bare, as in spec 02. The `json_string` output is a **string** containing JSON, not an object.

Example (Return):

```json
{
  "output_data": {
    "workflow_output_84zgk25bn": "{\"department\":\"Retail Operations\",\"role\":\"Retail Sales Associate\",\"store\":\"Mid Valley Megamall\",\"region\":\"KL City\",\"employment_type\":\"Full-time\",\"openings\":2,\"target_start_date\":\"17-11-2026\",\"base_salary_from\":1800,\"base_salary_to\":2300,\"about_the_role\":\"…\",\"what_you_will_do\":\"…\\n…\",\"what_we_look_for\":\"…\\n…\",\"benefits\":\"…\",\"shift_pattern\":\"Store open 12pm-6pm…\",\"requisition_id\":\"REQ-2611-018\"}",
    "b52a7030-aba8-4467-a433-e05c4633166c": false,
    "workflow_output_1ldrqy5bs": "The shift pattern says the store opens 12pm-7pm but staff work 12pm-6pm. Please confirm who covers 6-7pm."
  },
  "status": "success"
}
```

### 7.2 Reviewed JD JSON

The output's description says "Just reply whole same exact json". The app starts from `inputs.source_json` (so unknown keys and key order are kept) and overwrites the known keys with HR's reviewed values:

| JSON key | Value |
| :--- | :--- |
| `department`, `role` | As entered |
| `store` | Store **name** |
| `region` | Region of the store, from Settings |
| `employment_type` | Same style as received: `Full time` / `Part time`, or `Full-time` / `Part-time` |
| `openings`, `base_salary_from`, `base_salary_to` | Numbers |
| `target_start_date` | Same separator as received: `DD/MM/YYYY` or `DD-MM-YYYY` |
| `about_the_role`, `benefits`, `shift_pattern` | Trimmed text (`""` if empty) |
| `what_you_will_do`, `what_we_look_for` | Points joined with `\n` |
| `requisition_id` | The REQ ID, unchanged |

If HR changes nothing, the JSON has the same values as received (numbers as numbers, the date in the same format).

### 7.3 Building and checking `output_data`

The task screen (§8) posts `{ requisition: RequisitionInput, decision: "approve" | "return", hr_comments?: string }` to `POST /api/tasks/{id}/complete`. `completeOpusTask()` routes by `task_type`; for `HR_JD_CHECK`:

1. `decision` must be `approve` or `return` → else `400 invalid` (field `decision`);
2. `return` needs a non-empty `hr_comments` → else `400 comment_required` (field `hr_comments`), "Add a comment so the hiring manager knows what to change.";
3. `requisition` is validated with `RequisitionInputSchema` and the same department / role / store checks as New requisition, for both decisions;
4. builds the three outputs (§7.1, §7.2) from the validated input;
5. checks the three keys against the task's `expected_output_schema` (spec 02 §7.2 step 3 → `500 opus_schema_mismatch`);
6. sends `{ "output_data": { … }, "status": "success" }` with `sendCallback()` to the task's `execution_id`.

Responses (`401` closed, `404`, `422`, `502`, `504`) are handled exactly as in spec 02 §7.4. The requisition and task change **only after Opus answers `200`**.

### 7.4 Requisition after `200`: both decisions

- HR's field values are saved with `applyInput()` (they are what Opus now holds).
- Review round 1 `hr = { decision, by, at, comments, edited }`; `decision` is `"approve"` or `"reject"` (the existing review-history value for a return); `edited` is true if any field changed.
- If any field changed: new version "Edits during HR review" (by role HR). Activity "Changed: Store, Openings…" as in spec 02.

### 7.5 Approve

- Review round 1 `outcome = "approved"`; the latest version is marked `published`.
- Status `JobPosting`, then straight away the posting step (same request, no simulator event, no simulator job): `posting = { generated_at, file_name: "job_post_<REQ>.pdf" }`, status `Live`, `stage_times` for both, `screening = "open"`, `completed_at = now`.
- Activity: "<HR> approved[ with edits]. Sent to Opus." and "Job posting generated: LinkedIn-style post as PDF (demo). JD live."
- Task: `done`, outcome `approve`, label "Approved" / "Approved with edits", title "Reviewed requisition · approved".

`runPostingStep()` in `src/server/flows.ts` touches the simulator job; a job-free `opusPublish(r, actor)` is added next to `opusResubmitted()` and the posting part is shared.

### 7.6 Return to hiring manager

- Review round 1 `outcome = "returned"`.
- `round = 2`, a new review entry `{ round: 2, outcome: "pending" }`, status `ReturnedToHm`, `stage_times.ReturnedToHm = now`.
- Activity: "<HR> returned the requisition to <HM> (round 1): "<comment>"". **No** task is created; the HM round-2 task comes from the "Hiring Manager Review Round 2" webhook (later spec).
- Task: `done`, outcome `return`, label "Returned", title "Reviewed requisition · returned to HM".
- The Presenter **Advance** action keeps refusing the requisition (`409 opus_driven`).

## 8. Task screen (UI change)

For an `HR_JD_CHECK` task with `inputs.prefill` (Opus task), `/tasks/[id]` shows a new `OpusHrReviewTask` screen; simulator HR tasks keep `HrVerifyTask`.

- Header "Review requisition · <role>, <store>", chip "Round 1 of 3", the "Opus is waiting on this step" banner.
- **Round 1 history** (read only): the AI pre-check result or the Message to Hiring Manager, and the hiring manager's note, from the requisition's review round 1.
- The requisition fields from `RequisitionFormFields` (spec 02 §8), prefilled from `inputs.prefill`, editable, same rules as New requisition. Unmatched values show as in spec 02.
- **Decision** (radio): "Approve and publish" / "Return to hiring manager".
- **HR Response Message** (multi-line): required for Return, optional for Approve. The helper text says it is sent to Opus.
- Button **Send decision to Opus**. Field errors under the fields; Opus errors through `ClosedBanner` / `toSubmitError`.
- After `200`: the sent state, then read only with the outcome label. A done or closed task shows read only.

## 9. Changes to existing behaviour

- Spec 02's receiver warning "expected AiPrecheck round 1" becomes per-node (§6.1 step 8).
- `completeOpusTask()` no longer rejects `HR_JD_CHECK` with `400 unsupported`.
- Spec 01 and 02 formats are unchanged. This node uses its own formats (`Full-time`, `DD-MM-YYYY`) in both directions.

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/opusNodes.ts` | `hr_review_r1` node, `HR_REVIEW_JSON_KEYS`, JSON-input support in `OpusNode` / `readInputs()`, `buildHrReviewOutput(source_json, r, decision, message)`, `formatOpusDateDash()` (`YYYY-MM-DD` → `DD-MM-YYYY`). |
| `src/server/app/webhook.ts` | `receiveOpusTask()`: JSON input parse (`422 invalid_json_input`), per-node assignee, title, inputs and requisition update (§6.3). |
| `src/server/flows.ts` | `opusHrReceived()`, `opusPublish()`, `opusHrReturned()`; posting logic shared with `runPostingStep()`. |
| `src/server/service.ts` | `completeOpusTask()` branch for `HR_JD_CHECK` (§7.3–7.6). |
| `src/components/tasks/OpusHrReviewTask.tsx` (new) | HR screen (§8). |
| `src/app/tasks/[id]/page.tsx` | Route `HR_JD_CHECK` + `prefill` to `OpusHrReviewTask`. |
| `README.md` | Node URL and the `hr_review_r1` row in the Opus nodes table. |

## 11. How to test

1. **Locally, replayed payload:** set the env vars; take a requisition with an `opus_cases` entry in `WithHr` round 1 (finish the spec 02 flow, or edit a seeded one). Save the full webhook body (sample `inputs` + `execution_id`, `workflow_id`, `callback`, `expected_output_schema`) as `sample-hr-review-r1.json` with `requisition_id` set to that REQ, then:
   `curl -X POST "http://localhost:3000/api/opus/webhook?node=hr_review_r1&secret=…" -H "content-type: application/json" --data @sample-hr-review-r1.json`
   Check the HR task screen. The callback goes to Opus with a spent token, which tests the `401` path.
2. **Live callback:** replay the body of a real run that is paused at this node (from the Opus case audit, `GET /api/opus/cases/{REQ}/audit`) with its real token, then Approve or Return and check that Opus resumes.
3. **End-to-end:** once Opus delivers to the Vercel URL (spec 02 blocker), run a full case.

## 12. Acceptance criteria

1. When Opus reaches the node, HR gets an open task "Review requisition · <role>" and the requisition shows **With HR, round 1** (also when it arrives straight from `AiPrecheck`).
2. The screen shows all fields prefilled from the JSON input (`Full-time` → Full-time, `17-11-2026` → 17 Nov 2026, store name matched), and the round-1 history read only.
3. An input that isn't valid JSON, or has no known `requisition_id` → `422`, nothing created. Secret, node, body and workflow checks behave as in spec 02.
4. The same payload sent twice creates one task.
5. **Approve** without changes: Opus receives the three outputs; the JSON has the same values as received, `Pass Status` `true`, message `""` or HR's text. After `200` the requisition is **Live** with a job posting PDF, and the review history shows "Approved".
6. **Approve** with edits: the JSON carries the edits in the input formats; the requisition holds them, a new version "Edits during HR review" exists, and the label is "Approved with edits".
7. **Return** without a comment shows a field error and calls nothing. With a comment: `Pass Status` `false`, message = the comment; after `200` the requisition is **Returned to HM, round 2**, with no new task.
8. If the callback fails (network error, `422`, timeout), the requisition stays **With HR** and the task stays open; a spent token closes the task with the existing message.
9. Invalid fields (e.g. role not in the department) show field errors and Opus is not called.
10. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log.
11. Simulator HR tasks and the spec 02 HM task work as before.
12. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | `workflow_id` of the payload | The same "Valiram - Publish JD" workflow (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`); the existing `wrong_workflow` check applies. |
| 2 | What HR can do | Edit all fields, then Approve or Return (comment required to return). |
| 3 | `workflow_output_1ldrqy5bs` has `variable_name` `workflow_output_1bxkc7tyo` | A Builder mistake; both become `workflow_output_1ldrqy5bs` (§4.1 step 3). The app sends `workflow_output_1ldrqy5bs`. |
| 4 | `Pass Status` (`b52a7030-…`, `bool`) | Sent by the app: `true` = Approve, `false` = Return. The workflow branches on it. |
| 5 | Format of the reviewed JSON | Same keys and formats as this node's input (`Full-time`, `DD-MM-YYYY`), unknown keys kept, as the output description asks. |
| 6 | After Approve | The app generates the posting PDF and sets **Live** at once; no Opus posting node. |
| 7 | After Return | **Returned to HM, round 2**, with no task until the HM Review Round 2 webhook (later spec). |
| 8 | HR edits on Return | Saved too, because Opus now holds them and the round-2 HM webhook will carry them. |
| 9 | HR assignee | The requisition's `hr_assignee`, else the first HR recruiter in Settings (as the simulator). Shared pool vs named recruiter is still TBC in the requirements. |
