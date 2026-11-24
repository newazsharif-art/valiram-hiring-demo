# 06 · Opus Integration · Hiring Manager Review Round 3 (Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build. IDs from the real run of REQ-2611-046 (case 83294) on 2026-11-24 (§6.2a) |
| **Date** | 2026-11-24 (MYT) |
| **Depends on** | [04 · Hiring Manager Review Round 2](04-OpusIntegration-HMReviewR2.md) (HM node with HR Response Message + JSON input, `reply: "json"`, `opusHmReceived()`, `opusResubmitted()`), [05 · HR Approval Round 2](05-OpusIntegration-HRReviewR2.md) (HR **Return** → `ReturnedToHm` round 3) |
| **Branch** | `spec-06-hm-review-r3`, created from `main` (specs 02–05 are merged) |
| **Scope** | Backend and Opus Builder setup. The HM task screen already handles round 3 (§8) |
| **Opus node** | "Hiring Manager Review Round 3", an Off-Platform node in the workflow "Valiram - Publish JD" (`OPUS_CREATE_REQUISITION_WORKFLOW_ID`, confirmed). Seen in the audit of cases REQ-2611-040 and REQ-2611-045 as `BRANCHED_OUT` (executionIndex 7), so it exists in Builder but has never run |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

When HR returns the requisition at **HR Approval Round 2** (spec 05 §7.3, `Pass Status = false`), the Opus workflow pauses at **Hiring Manager Review Round 3** and POSTs the task to the app's webhook. The app:

1. creates a round-3 **Revise requisition** task (`HM_JD_REVISE`) for the requisition's hiring manager;
2. keeps the requisition **Returned to HM, round 3** (`ReturnedToHm`), which spec 05 already set when HR returned it;
3. shows the hiring manager the **HR Response Message** (read only), a note that this is the last review round, and all requisition fields, prefilled from the webhook JSON (HR's round-2 edits included) and editable;
4. when the hiring manager submits, calls the Opus callback API for the stored `execution_id` with the updated requisition JSON, saves the fields on the requisition, and moves it to **With HR** (`WithHr`, round 3).

## 2. Out of scope

- **HR Approval Round 3** and the round-3 rejection (HR returns in round 3 → requisition **Rejected**). Next spec (07), with its real IDs.
- A note or comment from the hiring manager back to HR (the round-2 node has no output for it; see §13 #1).
- The hiring manager withdrawing the requisition instead of resubmitting.
- Node timeout handling (HM nodes time out after about 600 s in Opus; the case then fails, as in round 2).
- Case status polling, notifications, reminders, file inputs and outputs.

## 3. What is different from spec 04

The node is expected to have the same shape as **Hiring Manager Review Round 2**: two inputs (HR Response Message and one `json_string` with all fields) and one output (the updated JSON). Only the IDs, the round and the status around it change.

| | Spec 04 (HM Review R2) | This spec (HM Review R3) |
| :--- | :--- | :--- |
| HR Response Message input (`str`) | `workflow_input_mffq3gx3y` | **`workflow_input_q8gs2ohgz`** |
| JSON input (`json_string`) | `workflow_input_1n862ffg8` | **`workflow_input_o66ljyr0o`** |
| Updated Json output (`json_string`) | `workflow_output_0256au6te`, "Updated Json", not nullable | **`workflow_output_a78p5ndvb`**, "Updated JSON", **nullable** |
| Comes after | HR Approval Round 1 → Return | HR Approval Round 2 → Return |
| Status before → after submit | `ReturnedToHm` r2 → `WithHr` r2 | `ReturnedToHm` r3 → `WithHr` r3 |
| Next node | HR Approval Round 2 | HR Approval Round 3 (spec 07) |
| Webhook secret | `?secret=` in the URL | Header `X-Valiram-Webhook-Secret` (the URL has no `secret=`) |
| Screen | "Round 2 of 3", "Round 3 is the last review round" | "Round 3 of 3", "This is the last review round" |

The receiver, secret check, payload schema, idempotency, callback sending, schema check and error handling are the same as in spec 02 §6.1–6.3, §6.5, §7.2 step 3 and §7.3–7.4. JSON parsing, field mapping and the updated-JSON reply are the same as in spec 04 §6.2 and §7.2. This spec describes only what changes.

If the real payload has a different shape (for example an extra HM note output, or no HR message input), §5–§7 are updated from it before the build.

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 0 | Node name | **Hiring Manager Review Round 3** (the name in Builder and in the audit). |
| 1 | Node inputs | HR Response Message (`str`) wired from the HR Approval Round 2 output `workflow_output_a6harg7au`; requisition JSON (`json_string`) wired from the HR Approval Round 2 output `workflow_output_pe8znczzs` (Reviewed JD Json), so the HM sees HR's round-2 edits. The JSON must include `requisition_id`. |
| 2 | Node output | `workflow_output_a78p5ndvb` (`json_string`, "Updated JSON", nullable), the input of HR Approval Round 3. |
| 3 | Webhook URL and secret | `https://valiram-hiring-demo.vercel.app/api/opus/webhook?node=hm_review_r3` with the custom header `X-Valiram-Webhook-Secret: <OPUS_WEBHOOK_SECRET>`. Done; the real run sent the header and no `?secret=` (§6.2a). `?secret=` still works as a fallback. On a preview URL also `&x-vercel-protection-bypass=<secret>`. |
| 4 | Branch | HR Approval Round 2 `Pass Status` = `538fe319-3380-4b25-a123-a82a914bdc65`: `false` → this node; `true` → Job Description Page Generator. The `true` path is confirmed (REQ-2611-042, -045). The `false` path and the input wiring in step 1 are set up in Builder (confirmed by the user 2026-11-24) but have never run. |
| 5 | Timeout | Keep the 15 s default. |
| 6 | Publish the workflow | Then run one test case (§11). |

### 4.2 App configuration

No new variables. Uses `OPUS_WEBHOOK_SECRET`, `OPUS_SERVICE_KEY`, `OPUS_CREATE_REQUISITION_WORKFLOW_ID` and the Upstash store as in spec 02 §4.2.

## 5. Node identification

New entry in `OPUS_NODES` (`src/server/app/opusNodes.ts`):

```ts
hm_review_r3: {
  task_type: "HM_JD_REVISE",
  round: 3,
  node_id: "n_hm_revise_r3",          // same stage key pattern as the simulator (fixtures node_map: n_precheck_r2 … n_hr_verify_r3)
  label: "Hiring Manager Review Round 3",
  inputs: { "workflow_input_q8gs2ohgz": "message" },   // HR Response Message
  json_input: "workflow_input_o66ljyr0o",
  json_keys: REQ_JSON_KEYS,
  reply: "json",
  json_output: "workflow_output_a78p5ndvb",                // §7.1
},
```

- `reply: "json"` today always writes the round-2 output (`HM_REVIEW_R2_OUTPUT`). As with the HR outputs in spec 05 §5, the output ID moves onto the node: new optional `OpusNode.json_output`, set on `hm_review_r2` (`workflow_output_0256au6te`, unchanged) and `hm_review_r3`.
- `buildHmUpdatedJsonOutput(outputId, source_json, r)` takes the node's output ID. `completeOpusTask()` passes `opusNodeById(t.node_id).json_output`; a `json` node without `json_output` is a code error (`500`).
- `readInputs()`, `buildPrefill()` and `buildReviewedJson()` are reused unchanged.

## 6. Webhook receiver

### 6.1 Order of steps

Same endpoint and steps as spec 04 §6.1, with these changes:

| # | Step | Change |
| :--- | :--- | :--- |
| 6a | Parse the JSON input (`workflow_input_o66ljyr0o`; JSON string, an object is also accepted). | Missing, not valid JSON, or not an object → `422 invalid_json_input`. |
| 6 | `requisition_id` is read **from inside the JSON**. | Same `422 unknown_requisition` rule. |
| 8 | Status guard: the requisition should be `ReturnedToHm` round 3 (HR returned it, spec 05 §7.3). Otherwise log a warning, still create the task, and bring the requisition to `ReturnedToHm` round 3 (§6.3). | The existing guard (`ReturnedToHm` at the node's round for HM rounds > 1) already covers this. |

The HR Response Message is optional: missing or empty → the alert is not shown, and a warning is logged. (HR's message is required on Return in the app, so it should always be there.)

### 6.2 Input mapping (webhook → app)

| Input | Label (front end) | App field | Rule |
| :--- | :--- | :--- | :--- |
| `workflow_input_q8gs2ohgz` (`str`) | HR Response Message | task `message` | Read only. Shown as is (line breaks kept). Not sent back |
| `workflow_input_o66ljyr0o` (`json_string`) | – | `REQ_JSON_KEYS` | Exactly as spec 04 §6.2 |

- `employment_type`: `Full time` or `Full-time`; `target_start_date`: `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD`. The reply keeps the style received.
- Missing or unreadable fields fall back to the requisition with a warning; values that don't match Settings go to `inputs.unmatched`; unknown keys are kept in `source_json` and sent back unchanged.

### 6.2a Real payload (reference)

Captured from `GET /api/opus/webhook/log` for case REQ-2611-046 (Opus case 83294) at 2026-11-24 09:58 MYT: HM R1 resubmit → HR R1 Return → HM R2 resubmit → HR R2 Return → this node. The app answered `400 unknown_node` (node not built yet), so the case failed there, as planned. `workflow_id` `6576e72f-39e0-4e0d-b3e3-38f7ef1c931a` ("Valiram - Publish JD"); `callback` has the same shape as in spec 02 (`url` = `https://operator.opus.com/v1/execution/callback/<execution_id>`, `token_header` = `X-Opus-Callback-Token`). Headers included `x-valiram-webhook-secret` (value masked); user agent `python-httpx/0.28.1`.

`inputs` as received (the HR Response Message keeps HR's line break):

```json
{
  "workflow_input_q8gs2ohgz": {
    "type": "str",
    "value": "Spec 06 test: round 2 return.\nPlease state the rest day rule in one sentence. This is the last review round."
  },
  "workflow_input_o66ljyr0o": {
    "type": "json_string",
    "value": "{\"requisition_id\":\"REQ-2611-046\",\"department\":\"Retail Operations\",\"role\":\"Retail Sales Associate\",\"store\":\"Mid Valley Megamall\",\"region\":\"KL City\",\"employment_type\":\"Full time\",\"openings\":2,\"target_start_date\":\"04/01/2027\",\"base_salary_from\":1800,\"base_salary_to\":2300,\"about_the_role\":\"Join our store team as the first point of contact for shoppers, helping them find the right products and enjoy a smooth purchase. You will work closely with the Store Supervisor and your teammates to keep the shop floor welcoming.\",\"what_you_will_do\":\"Greet customers, understand their needs and recommend suitable products\\nProcess sales, returns and exchanges accurately at the point-of-sale system\\nReplenish stock and keep displays neat and on-brand\\nWork towards individual and team sales targets\",\"what_we_look_for\":\"At least 1 year of retail or customer-facing experience\\nGood communication skills in English and Bahasa Malaysia\\nPositive, friendly and team-oriented attitude\",\"benefits\":\"EPF, SOCSO and EIS contributions\\nStaff discount on store products\\nAnnual leave and medical leave as per company policy\",\"shift_pattern\":\"Store open 12pm-7pm. Staff work 12pm-6pm, 6 hours a day, with 1 rest day each week (staff choose the day).\"}"
  }
}
```

`workflow_input_o66ljyr0o` decoded (`Full time`, date `DD/MM/YYYY`; `04/01/2027` is 4 Jan 2027):

```json
{
  "requisition_id": "REQ-2611-046",
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
  "shift_pattern": "Store open 12pm-7pm. Staff work 12pm-6pm, 6 hours a day, with 1 rest day each week (staff choose the day)."
}
```

`expected_output_schema` as received:

```json
{
  "workflow_output_a78p5ndvb": {
    "type": "json_string",
    "display_name": "Updated JSON",
    "variable_name": "workflow_output_a78p5ndvb",
    "description": "JSON response returned by the external system after completing the Hiring Manager Review Round 3 task, containing the updated review results or related data.",
    "is_nullable": true
  }
}
```

### 6.3 Task and requisition update

**Task**: as spec 04 §6.3, with `round = 3`, `node_id = "n_hm_revise_r3"` and `inputs.round = 3`. Assignee = the requisition's `hm_user`; title `Revise requisition · <role>`; `inputs.message` (HR Response Message), `inputs.returned_by` (the requisition's `hr_name`, else `"HR"`), `inputs.prefill`, `inputs.unmatched`, `inputs.source_json`, `inputs.requisition_id`, `source = "opus"`. `execution_id` is appended to `db.opus_cases[id].execution_ids`.

**Requisition**: `opusHmReceived()` (spec 04) already works for any round > 1, so it is reused unchanged:

- Fields are **not** overwritten from the payload.
- If already `ReturnedToHm` round 3 (normal path): no status change.
- Otherwise (the app missed HR's round-2 `200`, or the decision was made outside the app): `round = 3`, review round 2 `outcome = "returned"`, review `{ round: 3, outcome: "pending" }` if missing, status `ReturnedToHm`, `stage_times.ReturnedToHm = now`, activity "Opus returned the requisition to the hiring manager (round 2)."
- If review round 2 has no `hr.comments`, the HR Response Message is saved there.
- Activity: "Opus paused at Hiring Manager Review Round 3; task T-… assigned to <HM>."

## 7. Callback (hiring manager submits)

### 7.1 Output mapping (app → Opus)

| Output ID (Opus) | Display name | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_output_a78p5ndvb` | Updated Json | `json_string` | `buildReviewedJson(source_json, next)`: same keys and formats as the input (spec 04 §7.2), unknown keys kept |

The value is a **string** containing JSON. The output is nullable (unlike round 2), but the app always sends it: HR Approval Round 3 needs the HM's JSON as its input.

### 7.2 Building, checking and sending

Same as spec 04 §7.3, with the output ID taken from the node (§5). Responses `401` / `404` / `422` / `502` / `504` as spec 02 §7.4. The requisition and task change **only after Opus answers `200`**.

### 7.3 Requisition after `200`

`opusResubmitted()` (spec 02 §7.5) is reused unchanged:

- All submitted fields saved with `applyInput()`.
- Review round 3 `hm = { by, at }`; new JD version "Revised after round 3".
- `status = "WithHr"`, `stage_times.WithHr = now`, `round` stays `3`. No simulator event.
- Activity: "<HM> resubmitted (vN). Sent to Opus; the requisition is now with HR." and, if fields changed, "Changed: …".
- Task: `done`, outcome `resubmitted`, label "Round 3", title "Revised requisition · resubmitted".

The HR Approval Round 3 task arrives through the next webhook (spec 07). Until then the requisition shows **With HR, round 3** with no HR task, and the Presenter **Advance** action refuses it (`409 opus_driven`).

## 8. Task screen

No code change. `OpusReviseTask` is already round-aware (spec 04 §8):

| | Round 3 (this spec) |
| :--- | :--- |
| Chip | "Round 3 of 3" |
| Subtitle | "<REQ> · Returned by <HR name> (HR) on <date MYT> · This is the last review round" |
| Read-only alert | "HR Response Message" (line breaks kept; hidden if empty) |
| Fields | Prefilled from the JSON (HR's round-2 edits included) |
| Button | Resubmit |

## 9. Changes to existing behaviour

- `HM_REVIEW_R2_OUTPUT` moves onto the `hm_review_r2` node as `json_output`; `buildHmUpdatedJsonOutput()` takes the output ID from the node. Spec 04 output values are unchanged.
- No change to the receiver guard, `opusHmReceived()`, `opusResubmitted()` or the HM screen.

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/opusNodes.ts` | `hm_review_r3` node; `OpusNode.json_output` (set on `hm_review_r2` and `hm_review_r3`); `buildHmUpdatedJsonOutput()` takes the output ID; header comment lists spec 06. |
| `src/server/service.ts` | `completeOpusTask()` passes the node's `json_output` for `reply: "json"`; `500` if missing. |
| `README.md` | `?node=hm_review_r3` in the API table and a "Hiring Manager Review Round 3 (spec 06)" paragraph in the Opus nodes section. |

## 11. How to test

1. **Payload capture: done** (REQ-2611-046, §6.2a). Delivery to production, the header secret and the HR R2 Return → HM R3 branch all work.
2. **Replayed payload:** save the captured body as `sample-hm-review-r3.json`, with `requisition_id` set to a requisition that has an `opus_cases` entry and is `ReturnedToHm` round 3. Then:
   `curl -X POST "https://<preview>/api/opus/webhook?node=hm_review_r3&secret=…" -H "content-type: application/json" --data @sample-hm-review-r3.json`
   Check the HM screen. The callback goes to Opus with a spent token, which tests the `401` path.
3. **End-to-end (real run):** same path as step 1, after the build. Resubmit as the HM and check that the requisition is **With HR, round 3** and that Opus moves to **HR Approval Round 3** (it will fail there until spec 07 is built, which is expected).
4. **By API:** `POST /api/tasks/{id}/complete` with `{"output_data": {"requisition": …}}` (cookie `vh_user=jason`). Test driver: scratchpad `e2e/drive.mjs`, extended with a `return2` step.

## 12. Acceptance criteria

1. When Opus reaches the node, the hiring manager gets an open task "Revise requisition · <role>" and the requisition shows **Returned to HM, round 3**.
2. The screen shows "Round 3 of 3", "Returned by <HR name> (HR)", "This is the last review round", the HR Response Message read only with line breaks, and all fields prefilled from the JSON (HR's round-2 edits included).
3. A requisition that is not `ReturnedToHm` round 3 when the webhook arrives still gets the task, is moved to **Returned to HM, round 3**, and a warning is logged.
4. An input that isn't valid JSON, or has no known `requisition_id` → `422`, nothing created. Secret, node, body and workflow checks behave as in spec 02.
5. The same payload sent twice creates one task.
6. **Resubmit** without changes: Opus receives exactly `workflow_output_a78p5ndvb`, a JSON string with the same values and formats as received (unknown keys kept), and returns `200`; the task is done and the requisition is **With HR, round 3**, version "Revised after round 3".
7. **Resubmit** with edits: the JSON carries the edits in the input formats; the requisition holds them; activity lists the changed fields.
8. If the callback fails (network error, `422`, timeout), the requisition stays **Returned to HM, round 3** and the task stays open; a spent token closes the task with the existing message.
9. Round-2 HM tasks still send `workflow_output_0256au6te`.
10. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log.
11. Spec 02–05 tasks and simulator tasks work as before.
12. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | Input and output IDs, payload shape | Same shape as HM Review Round 2. Taken from the real webhook of REQ-2611-046 (case 83294) on 2026-11-24: inputs `workflow_input_q8gs2ohgz` (str) and `workflow_input_o66ljyr0o` (json_string), output `workflow_output_a78p5ndvb` (json_string, nullable). |
| 11 | Webhook secret | Sent by Opus in the header `X-Valiram-Webhook-Secret` (Builder supports custom headers; seen on the real run). No app change: the receiver already reads the header first. Other nodes may move from `?secret=` to the header later. |
| 2 | Node name | "Hiring Manager Review Round 3", in Builder and in the app (node label, activity). Stepper stage label unchanged (Settings `node_map`). |
| 3 | `workflow_id` of the payload | The same "Valiram - Publish JD" workflow; the existing `wrong_workflow` check applies. |
| 4 | Output IDs | Per node (`OpusNode.json_output`), as the HR outputs in spec 05 §13 #4. |
| 5 | Format of the updated JSON | Same keys and formats as this node's input, unknown keys kept, as spec 04. |
| 6 | HR Response Message | Shown read only; not sent back. Saved on review round 2 if HR's comment isn't there already. |
| 7 | What the hiring manager can change | All fields, on the New requisition form (as specs 02 and 04). No note field. |
| 8 | Status after a successful submit | `WithHr`, round stays 3, set only after Opus answers `200`. HR round-3 task comes from the HR Approval Round 3 webhook (spec 07). |
| 9 | Requisition not in `ReturnedToHm` round 3 on receipt | Task created anyway; requisition brought to `ReturnedToHm` round 3 (Opus is the source of truth), as spec 04 §13 #7. |
| 10 | Last-round warning on the HM screen | The existing subtitle "This is the last review round" (spec 04 §8). |
