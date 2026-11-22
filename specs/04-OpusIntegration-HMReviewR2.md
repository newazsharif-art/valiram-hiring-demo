# 04 · Opus Integration · Hiring Manager Review Round 2 (Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build |
| **Date** | 2026-11-23 (MYT) |
| **Depends on** | [02 · Hiring Manager Review Round 1](02-OpusIntegration-HmReviewR1.md) (receiver, callback sender, `OpusReviseTask`), [03 · HR Review Round 1](03-OpusIntegration-HRReviewR1.md) (JSON input, reviewed JSON reply, HR **Return** → `ReturnedToHm` round 2) |
| **Branch** | `spec-04-hm-review-r2`, created from `main` (specs 02 and 03 are merged) |
| **Scope** | Backend, Opus Builder setup, and the HM task screen (§8) |
| **Opus node** | "Hiring Manager Review Round 2", an Off-Platform node in the workflow "Valiram - Publish JD" (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`, confirmed) |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

When HR returns the requisition at **Round 1 · HR final check** (spec 03 §7.6, `Pass Status = false`), the Opus workflow pauses at **Hiring Manager Review Round 2** and POSTs the task to the app's webhook. The app:

1. creates a round-2 **Revise requisition** task (`HM_JD_REVISE`) for the requisition's hiring manager;
2. keeps the requisition **Returned to HM, round 2** (`ReturnedToHm`), which spec 03 already set when HR returned it;
3. shows the hiring manager the **HR Response Message** (read only) and all requisition fields, prefilled from the webhook JSON (HR's edits included) and editable;
4. when the hiring manager submits, calls the Opus callback API for the stored `execution_id` with the updated requisition JSON, saves the fields on the requisition, and moves it to **With HR** (`WithHr`, round 2).

## 2. Out of scope

- HR final check round 2, Hiring Manager Review round 3, HR final check round 3 and the round-3 rejection. Each gets its own node entry (§5) in a later spec.
- A note or comment from the hiring manager back to HR (the node has no output for it).
- Case status polling, notifications, reminders, file inputs and outputs.
- The Opus delivery problem on the Vercel URL (spec 02 testing). This node uses the same receiver, so it is tested with replayed payloads (§11) until Opus fixes delivery.

## 3. What is different from specs 02 and 03

| | Spec 02 (HM Review R1) | Spec 03 (HR final check R1) | This spec (HM Review R2) |
| :--- | :--- | :--- | :--- |
| Inputs | 16 flat inputs | One `json_string` input | **Two**: the HR Response Message (`str`) and one `json_string` input with all fields, `requisition_id` included |
| Message shown | Message to Hiring Manager (AI pre-check) | None | **HR Response Message** (HR's return comment) |
| Outputs | 14 flat values + Requisition Id | Reviewed JSON, Pass Status ×2, HR message | **One**: the updated JSON (`json_string`) |
| Formats in | `Full time`, `DD/MM/YYYY` | `Full time` / `Full-time`, `DD/MM/YYYY` / `DD-MM-YYYY` | `Full time`, `DD-MM-YYYY` (real run; the first sample had `DD/MM/YYYY`) |
| Who acts | Hiring manager | HR recruiter | Hiring manager |
| Status before → after submit | `ReturnedToHm` r1 → `WithHr` r1 | `WithHr` r1 → `Live` or `ReturnedToHm` r2 | `ReturnedToHm` r2 → `WithHr` r2 |

The receiver, secret check, payload schema, idempotency, callback sending, schema check and error handling are the same as in spec 02 §6.1–6.3, §6.5, §7.2 step 3 and §7.3–7.4. The JSON input parsing and the reviewed-JSON reply are the same as in spec 03 §6.1 step 6a, §6.2 and §7.2. This spec describes only what changes.

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 1 | Node inputs | `workflow_input_mffq3gx3y` (`str`, HR Response Message) and `workflow_input_1n862ffg8` (`json_string`, keys in §6.2, `requisition_id` included). Already in the sample. |
| 2 | Node output | `workflow_output_0256au6te` (`json_string`, "Updated Json", **not nullable**), as in the real payload of 2026-11-23 (§7.1). |
| 3 | Webhook URL | `https://<app-domain>/api/opus/webhook?node=hm_review_r2&secret=<OPUS_WEBHOOK_SECRET>`; on a preview URL also `&x-vercel-protection-bypass=<secret>` (spec 02 §4.1 steps 5–6a). Type a plain `&`: the test run had `&amp;secret=`, which the app reads as a parameter named `amp;secret`, so it answered `401` and Opus failed the case (§13 #10). |
| 4 | Timeout | Keep the 15 s default. |
| 5 | Publish the workflow | Then replay or run one test case (§11). |

### 4.2 App configuration

No new variables. Uses `OPUS_WEBHOOK_SECRET`, `OPUS_SERVICE_KEY`, `OPUS_CREATE_REQUISITION_WORKFLOW_ID` and the Upstash store as in spec 02 §4.2.

## 5. Node identification

New entry in `OPUS_NODES` (`src/server/app/opusNodes.ts`):

```ts
hm_review_r2: {
  task_type: "HM_JD_REVISE",
  round: 2,
  node_id: "n_hm_revise_r2",          // same stage key as the simulator, so the stepper and node_map work
  label: "Hiring Manager Review Round 2",
  inputs: { workflow_input_mffq3gx3y: "message" },   // flat input, read as today
  json_input: "workflow_input_1n862ffg8",
  json_keys: REQ_JSON_KEYS,           // §6.2
  reply: "json",                      // §7.1
},
```

- `OpusNode` already supports a flat `inputs` map and a `json_input`; `readInputs()` reads both in one call, so this node needs no reader change. `message` comes from the flat input, everything else from the JSON.
- New `OpusNode.reply`: `"fields"` (spec 02, default), `"hr_decision"` (spec 03) or `"json"` (this spec). `completeOpusTask()` chooses the output builder by the task's node (found by `task.node_id`) instead of by `task_type`, because two `HM_JD_REVISE` nodes now reply differently.
- `HR_REVIEW_JSON_KEYS` is renamed `REQ_JSON_KEYS` and shared by `hr_review_r1` and `hm_review_r2` (same keys).

## 6. Webhook receiver

### 6.1 Order of steps

Same endpoint and steps as spec 02 §6.2 and spec 03 §6.1, with these changes:

| # | Step | Change |
| :--- | :--- | :--- |
| 6a | Parse `inputs.workflow_input_1n862ffg8.value` (JSON string; an object is also accepted). | Missing, not valid JSON, or not an object → `422 invalid_json_input`, as in spec 03. |
| 6 | `requisition_id` is read **from inside the JSON**. | Same `422 unknown_requisition` rule. |
| 8 | Status guard: the requisition should be `ReturnedToHm` round 2 (HR returned it, spec 03 §7.6). Otherwise log a warning and still create the task, and bring the requisition to `ReturnedToHm` round 2 (§6.3). | – |

The HR Response Message is optional: missing or empty → the alert is not shown (§8), and a warning is logged.

### 6.2 Input mapping (webhook → app)

| Input | Label (front end) | App field | Rule |
| :--- | :--- | :--- | :--- |
| `workflow_input_mffq3gx3y` (`str`) | HR Response Message | task `message` | Read only. Shown as is (line breaks kept). Not sent back |
| `workflow_input_1n862ffg8` (`json_string`) | – | the keys below | |

Keys inside `workflow_input_1n862ffg8` (`REQ_JSON_KEYS`, same as spec 03 §6.2):

| JSON key | Label (front end) | App field | Rule |
| :--- | :--- | :--- | :--- |
| `requisition_id` | Requisition ID | lookup key | Required |
| `department` | Department | `department` | |
| `role` | Role | `role` | |
| `store` | Store | `store_id` | Store **name** → `store_id` via Settings (case-insensitive) |
| `region` | Region | `region` | Shown only; derived from the store |
| `employment_type` | Employment type | `employment_type` | `Full time` → `Full-time` (also accepts `Full-time`) |
| `openings` | Openings | `openings` | Integer |
| `target_start_date` | Target Start Date | `target_start` | `DD-MM-YYYY` → `YYYY-MM-DD` (also accepts `DD/MM/YYYY`, `YYYY-MM-DD`). `04-01-2027` is **4 Jan 2027** |
| `base_salary_from` | Base salary from | `base_min` | Number |
| `base_salary_to` | Base salary to | `base_max` | Number |
| `about_the_role` | About the role | `jd.about` | |
| `what_you_will_do` | What you will do | `jd.duties` | Split on `\n`, trimmed, blank lines removed |
| `what_we_look_for` | What we look for | `jd.requirements` | As above |
| `benefits` | Benefits | `jd.benefits` | Text, line breaks kept |
| `shift_pattern` | Shift pattern | `jd.shift_pattern` | Text, line breaks kept |

- The existing parsers (`parseEmploymentType`, `parseOpusDate`, `buildPrefill`) already accept these formats.
- Missing or unreadable fields fall back to the requisition, with a warning, as in spec 02. Values that don't match Settings go to `inputs.unmatched`, as in spec 02.
- Keys the app doesn't know are kept in the stored JSON (§6.3) and sent back unchanged (§7.2).

Real payload (REQ-2611-033, 2026-11-23, decoded; `value` arrives as an escaped JSON string):

```json
{
  "requisition_id": "REQ-2611-031",
  "department": "Retail Operations",
  "role": "Retail Sales Associate",
  "store": "Mid Valley Megamall",
  "region": "KL City",
  "employment_type": "Full time",
  "openings": 2,
  "target_start_date": "04-01-2027",
  "base_salary_from": 1800,
  "base_salary_to": 2300,
  "about_the_role": "Join our store team as the first point of contact for shoppers…",
  "what_you_will_do": "Greet customers…\nProcess sales, returns and exchanges…\n…",
  "what_we_look_for": "At least 1 year of retail or customer-facing experience…\n…",
  "benefits": "EPF, SOCSO and EIS contributions\nStaff discount on store products\n…",
  "shift_pattern": "Store open 10am-10pm. Rotating 8-hour shifts, 5 days a week, with 2 rest days each week."
}
```

### 6.3 Task and requisition update

`receiveOpusTask()` handles all three nodes; the HM branch gets the round-2 differences below.

**Task** (assignee = the requisition's `hm_user`; title `Revise requisition · <role>`):

| Field | Value |
| :--- | :--- |
| `task_type`, `round`, `node_id` | From `OPUS_NODES.hm_review_r2` |
| `execution_id`, `workflow_id`, `workflow_name`, `callback`, `expected_output_schema` | As in spec 02 §6.6 (`callback` server-side only) |
| `inputs.message` | HR Response Message |
| `inputs.returned_by` | The requisition's `hr_name` (the recruiter who returned it), else `"HR"` |
| `inputs.prefill` | Mapped values (§6.2) as a `RequisitionInput` |
| `inputs.unmatched` | Values that don't match Settings (department, role, store) |
| `inputs.source_json` | The decoded JSON object as received. Used to build the reply (§7.2) |
| `inputs.requisition_id`, `inputs.round` | REQ ID, `2` |
| `source` | `"opus"` |

`execution_id` is also appended to `db.opus_cases[id].execution_ids`, as in spec 02.

**Requisition** — new `opusHmReceived(r, round, message, taskId, hmName, nodeLabel)` in `src/server/flows.ts`, used for HM nodes with `round ≥ 2` (round 1 keeps `opusReturnToHm()`, which records the AI pre-check message):

- Fields are **not** overwritten from the payload; they change only when the hiring manager submits.
- No pre-check result is recorded (this node follows HR, not the AI pre-check).
- If the requisition is already `ReturnedToHm` round 2 (normal path): no status change.
- Otherwise (the app missed HR's `200`, or the HR decision was made outside the app): `round = 2`, review round 1 `outcome = "returned"`, a review entry `{ round: 2, outcome: "pending" }` if missing, status `ReturnedToHm`, `stage_times.ReturnedToHm = now`, activity "Opus returned the requisition to the hiring manager (round 1)."
- If review round 1 has no `hr.comments`, the HR Response Message is saved there, so the review history shows it.
- Activity: "Opus paused at Hiring Manager Review Round 2; task T-… assigned to <HM>."

## 7. Callback (hiring manager submits)

### 7.1 Output mapping (app → Opus)

| Output ID (Opus) | Display name | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_output_0256au6te` | Updated Json | `json_string` | `JSON.stringify` of the updated requisition in the **same keys and formats as the input** (§7.2) |

The value is a **string** containing JSON, not an object. The output is **not nullable**: without it Opus accepts the callback and then fails the node, so the app refuses to send if it is missing (spec 02 §7.2 step 3).

Example:

```json
{
  "output_data": {
    "workflow_output_0256au6te": "{\"requisition_id\":\"REQ-2611-031\",\"department\":\"Retail Operations\",\"role\":\"Retail Sales Associate\",\"store\":\"Mid Valley Megamall\",\"region\":\"KL City\",\"employment_type\":\"Full time\",\"openings\":2,\"target_start_date\":\"04-01-2027\",\"base_salary_from\":1800,\"base_salary_to\":2300,\"about_the_role\":\"…\",\"what_you_will_do\":\"…\\n…\",\"what_we_look_for\":\"…\\n…\",\"benefits\":\"…\",\"shift_pattern\":\"Store open 10am-10pm. Rotating 8-hour shifts…\"}"
  },
  "status": "success"
}
```

### 7.2 Updated JSON

Built by the existing `buildReviewedJson(source_json, next)` (spec 03 §7.2): start from `inputs.source_json` (unknown keys and key order kept), overwrite the known keys with the hiring manager's values.

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

If the hiring manager changes nothing, the JSON has the same values as received.

### 7.3 Building and checking `output_data`

The task screen (§8) posts `{ requisition: RequisitionInput }` to `POST /api/tasks/{id}/complete`, as in spec 02. `completeOpusTask()`, for a node with `reply: "json"`:

1. validates `requisition` with `RequisitionInputSchema` and the same department / role / store checks as New requisition; errors come back per field;
2. builds `{ workflow_output_0256au6te: buildReviewedJson(source_json, next) }`;
3. checks the key against the task's `expected_output_schema` (undeclared output, or a declared non-nullable output the app doesn't fill → `500 opus_schema_mismatch`, Opus not called);
4. sends `{ "output_data": { … }, "status": "success" }` with `sendCallback()` to the task's `execution_id`.

Responses (`401` closed, `404`, `422`, `502`, `504`) are handled exactly as in spec 02 §7.4. The requisition and task change **only after Opus answers `200`**.

### 7.4 Requisition after `200`

Reuses `opusResubmitted()` (spec 02 §7.5), which already works per round:

- All submitted fields are saved with `applyInput()`.
- Review round 2 `hm = { by, at }`; new JD version "Revised after round 2".
- `status = "WithHr"`, `stage_times.WithHr = now`. `round` stays `2`. No simulator event.
- Activity: "<HM> resubmitted (vN). Sent to Opus; the requisition is now with HR." and, if fields changed, "Changed: Store, Openings…".
- Task: `done`, outcome `resubmitted`, label "Round 2", title "Revised requisition · resubmitted".

The HR final check round 2 task arrives through the next webhook (later spec). Until then the requisition shows **With HR, round 2** with no HR task, and the Presenter **Advance** action refuses it (`409 opus_driven`).

## 8. Task screen (UI change)

`/tasks/[id]` already routes an `HM_JD_REVISE` task with `inputs.prefill` to `OpusReviseTask`. It becomes round-aware; nothing else changes:

| | Round 1 (spec 02) | Round 2 (this spec) |
| :--- | :--- | :--- |
| Chip | "Round 1 of 3" | "Round 2 of 3" |
| Subtitle | "<REQ> · Returned by the AI pre-check on <date MYT>" | "<REQ> · Returned by <HR name> (HR) on <date MYT> · Round 3 is the last review round" |
| Read-only alert | "Message to Hiring Manager" | "**HR Response Message**" (line breaks kept; hidden if empty) |
| Fields | Prefilled from `inputs.prefill` | Same, prefilled from the JSON (HR's edits included) |
| Button | Resubmit | Resubmit |

The alert title and subtitle come from `inputs.returned_by`: `"AI pre-check"` → round-1 wording, anything else → HR wording. There is no note field (spec 02 §7.2).

## 9. Changes to existing behaviour

- `HR_REVIEW_JSON_KEYS` → `REQ_JSON_KEYS` (rename only).
- `completeOpusTask()` picks the output builder by the task's node `reply` (§5), not by `task_type`. Spec 02 and 03 outputs are unchanged.
- The receiver's status guard and requisition update become per node: `hm_review_r1` → `AiPrecheck` r1 + `opusReturnToHm()`; `hr_review_r1` → `WithHr`/`AiPrecheck` r1 + `opusHrReceived()`; `hm_review_r2` → `ReturnedToHm` r2 + `opusHmReceived()`.
- Spec 01, 02 and 03 formats are unchanged.

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/opusNodes.ts` | `hm_review_r2` node; `OpusNode.reply`; rename `REQ_JSON_KEYS`; `HM_REVIEW_R2_OUTPUT = "workflow_output_0256au6te"`; `buildHmUpdatedJsonOutput(source_json, r)`; `opusNodeById(node_id)`. |
| `src/server/app/webhook.ts` | Per-node status guard, task inputs (`returned_by`, `source_json` for HM round 2) and requisition update (§6.3). |
| `src/server/flows.ts` | `opusHmReceived()` (§6.3). |
| `src/server/service.ts` | `completeOpusTask()` routes by node `reply`; `"json"` branch (§7.3); then `opusResubmitted()` as today. |
| `src/components/tasks/OpusReviseTask.tsx` | Round-aware chip, subtitle and alert title (§8). |
| `README.md` | Node URL and the `hm_review_r2` row in the Opus nodes table. |

## 11. How to test

1. **Locally, replayed payload:** set the env vars; take a requisition with an `opus_cases` entry that HR returned in round 1 (finish the spec 03 flow with **Return**, or edit a seeded one to `ReturnedToHm` round 2). Save the full webhook body (sample `inputs` + `execution_id`, `workflow_id`, `callback`, `expected_output_schema`) as `sample-hm-review-r2.json` with `requisition_id` set to that REQ, then:
   `curl -X POST "http://localhost:3000/api/opus/webhook?node=hm_review_r2&secret=…" -H "content-type: application/json" --data @sample-hm-review-r2.json`
   Check the HM task screen. The callback goes to Opus with a spent token, which tests the `401` path.
2. **Live callback:** replay the body of a real run paused at this node (from the Opus case audit, `GET /api/opus/cases/{REQ}/audit`) with its real token, Resubmit, and check that Opus resumes to HR final check round 2.
3. **End-to-end:** once Opus delivers to the Vercel URL (spec 02 blocker), run a full case: HM R1 → HR R1 Return → HM R2.

## 12. Acceptance criteria

1. When Opus reaches the node, the hiring manager gets an open task "Revise requisition · <role>" and the requisition shows **Returned to HM, round 2**.
2. The screen shows "Round 2 of 3", "Returned by <HR name> (HR)", the HR Response Message read only with line breaks, and all fields prefilled from the JSON (`Full time` → Full-time, `04-01-2027` → 4 Jan 2027, store name matched).
3. A requisition that is not `ReturnedToHm` round 2 when the webhook arrives still gets the task, is moved to **Returned to HM, round 2**, and a warning is logged.
4. An input that isn't valid JSON, or has no known `requisition_id` → `422`, nothing created. Secret, node, body and workflow checks behave as in spec 02.
5. The same payload sent twice creates one task.
6. **Resubmit** without changes: Opus receives exactly `workflow_output_0256au6te`, a JSON string with the same values and formats as received (unknown keys kept), and returns `200`; the task is done and the requisition is **With HR, round 2**, version "Revised after round 2".
7. **Resubmit** with edits: the JSON carries the edits in the input formats; the requisition holds them; activity lists the changed fields.
8. If the callback fails (network error, `422`, timeout), the requisition stays **Returned to HM, round 2** and the task stays open; a spent token closes the task with the existing message.
9. Invalid fields (e.g. role not in the department, fewer than 3 duties) show field errors and Opus is not called.
10. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log.
11. Spec 02 (HM round 1) and spec 03 (HR round 1) tasks, and simulator tasks, work as before.
12. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | `workflow_id` of the payload | The same "Valiram - Publish JD" workflow (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`); the existing `wrong_workflow` check applies. |
| 2 | Outputs | Only `workflow_output_0256au6te`, **not nullable** (real payload). No separate Requisition Id or Pass Status output; the REQ ID travels inside the JSON. |
| 3 | Format of the updated JSON | Same keys and formats as this node's input, as received (real run: `Full time`, `DD-MM-YYYY`), unknown keys kept, as in spec 03. |
| 4 | HR Response Message | Shown read only; not sent back. Saved on review round 1 if HR's comment isn't there already. |
| 5 | What the hiring manager can change | All fields, on the New requisition form (as spec 02). No note field. |
| 6 | Status after a successful submit | `WithHr`, round stays 2, set only after Opus answers `200`. HR round 2 task comes from a later webhook. |
| 7 | Requisition not in `ReturnedToHm` round 2 on receipt | Task created anyway; requisition brought to `ReturnedToHm` round 2 (Opus is the source of truth). |
| 8 | Hiring Manager Review Round 3 | Later spec, with its real input/output IDs. If it has the same shape, it becomes one more `OPUS_NODES` entry (`hm_review_r3`, `reply: "json"`). |
| 9 | Date `04-01-2027` | Day first → 4 Jan 2027, as in specs 01–03. The reply keeps the separator Opus sent. |
| 10 | IDs and output nullability | Taken from the real webhook of case REQ-2611-033 on 2026-11-23 (logged by `/api/opus/webhook/log`): inputs `workflow_input_mffq3gx3y` (str) and `workflow_input_1n862ffg8` (json_string), output `workflow_output_0256au6te` (json_string, not nullable). They replace the IDs of the first sample. |
