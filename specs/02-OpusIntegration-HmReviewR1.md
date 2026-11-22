# 02 · Opus Integration · Hiring Manager Review Round 1 (Off-Platform webhook)

| | |
| :--- | :--- |
| **Status** | Ready for build |
| **Date** | 2026-11-20 (MYT) |
| **Depends on** | [01 · Create Requisition](01-OpusIntegration-CreateRequisition.md) (case created, requisition left in `AiPrecheck`) |
| **Scope** | Backend, Opus Builder setup, and the HM task screen (§8) |
| **Opus node** | "Hiring Manager Review Round 1", an Off-Platform node in the workflow `6576e72f-39e0-4e0d-b3e3-38f7ef1c931a` ("Valiram - Publish JD", env `OPUS_CREATE_REQUISITION_WORKFLOW_ID`) |
| **Opus docs** | [Off-Platform Review](https://developer.opus.com/tasks/off-platform-review), [Off-Platform Task](https://developer.opus.com/tasks/off-platform-task) |

## 1. Goal

When the AI pre-check of round 1 finds problems, the Opus workflow pauses at **Hiring Manager Review Round 1** and POSTs the task to the app's webhook. The app:

1. creates a round-1 **Revise requisition** task (`HM_JD_REVISE`) for the requisition's hiring manager;
2. moves the requisition from `AiPrecheck` to `ReturnedToHm` (round 1);
3. shows the hiring manager the **Message to Hiring Manager** (read only) and all requisition fields, prefilled from the webhook and editable;
4. when the hiring manager submits, sends the 14 fields back to Opus through the callback API for the stored `execution_id`, saves them on the requisition, and moves it to **With HR** (`WithHr`).

This replaces the "stays in `AiPrecheck`" behaviour of spec 01 §8.3 for round 1.

## 2. Out of scope

- HR verification, Hiring Manager Review rounds 2 and 3, and the round-3 rejection. Each gets its own node entry (§5) in a later spec.
- Case status polling (`GET /api/v1/case/{caseId}/status`).
- Email / Slack notifications and reminders for the task.
- File inputs and outputs.

## 3. Opus facts this spec relies on

| Fact | Consequence |
| :--- | :--- |
| The webhook URL and optional headers are set on the node in Opus Builder. Header values are write-only. There is no request signing. | The app checks a **shared secret header** (§4.2). |
| The payload has no case ID and no node ID. `execution_id` is **not** the case ID. | The requisition is found by the **`requisition_id` input** (§6.3); the node by its webhook URL (§5). |
| Inputs arrive flat, keyed by input ID: `{ "<id>": { "type": "str" \| "float" \| "date", "value": … } }`. | The app reads them through an input-ID map (§6.4). |
| Opus waits 15 s (default) for a `200` and never resends. It retries 3× on network errors and `408/425/429/5xx`; any other `4xx` fails the step at once. | Store everything, answer fast. Use `4xx` only for requests that must never be retried (§6.2). |
| The callback token is single-use. Callback answers: `200` accepted, `401` token spent / run closed, `404` no execution, `422` undeclared output field (nothing stored, run stays paused). | Same handling as `completeTask()` already has for the simulator (§7.4). |
| Output values must be **bare**, keyed by the declared output IDs in `expected_output_schema`. | §7.1. |

## 4. Setup checklist

### 4.1 Opus Builder

| # | Step | Detail |
| :--- | :--- | :--- |
| 1 | Create Requisition input `requisition_id` | `workflow_input_ws7sv258o` (`str`), sent by the app on Execute Case (spec 01 §6). |
| 2 | Node input `requisition_id` | Wire it into "Hiring Manager Review Round 1" as `workflow_input_4foftw3r4` (`str`). Without it every webhook is rejected with `422` (§6.2). |
| 3 | Other node inputs | As in the input mapping (§6.4). |
| 4 | Node outputs | The 14 outputs in §7.1 (all nullable, as in the sample). |
| 5 | Webhook URL | `https://<app-domain>/api/opus/webhook?node=hm_review_r1` (production Vercel domain; preview URLs change on every deploy). |
| 6 | Webhook secret | Header `X-Valiram-Webhook-Secret: <same value as OPUS_WEBHOOK_SECRET>`. **If the node can't send custom headers**, add it to the URL instead: `…/api/opus/webhook?node=hm_review_r1&secret=<OPUS_WEBHOOK_SECRET>` (§6.2 step 2). |
| 6a | Vercel Deployment Protection (preview URLs) | Header `x-vercel-protection-bypass: <Protection Bypass for Automation secret>`, or without headers the query parameter `&x-vercel-protection-bypass=<secret>`. Vercel checks this before the app; a missing or wrong value returns Vercel's "Protected deployment" 401. |
| 7 | Timeout | Keep the 15 s default. |
| 8 | Publish the workflow | Then run one test case (§11). |

### 4.2 App configuration (Vercel Production + Preview, then redeploy)

| Variable | Purpose |
| :--- | :--- |
| `OPUS_WEBHOOK_SECRET` | Shared secret Opus sends in `X-Valiram-Webhook-Secret`. At least 32 random characters. Already listed in `.env.example`. |
| `OPUS_SERVICE_KEY`, `OPUS_CREATE_REQUISITION_WORKFLOW_ID` | From spec 01. The receiver is on when both are set. |

The Upstash Redis store (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) is required on Vercel, so the task saved by the webhook request is visible to the hiring manager's later requests.

## 5. Node identification

Each Off-Platform node gets its own webhook URL with a `node` query parameter. The node-name and round inputs in the payload (`workflow_input_9knpanwdj`, `workflow_input_wli0gftqb`) are **not used** by the app.

```ts
// src/server/app/opusNodes.ts
export const OPUS_NODES = {
  hm_review_r1: { task_type: "HM_JD_REVISE", round: 1, node_id: "n_hm_revise_r1", inputs: HM_REVIEW_INPUTS, outputs: HM_REVIEW_OUTPUTS },
  // later specs: hr_verify_r1, hm_review_r2, ...
} as const;
```

`node_id` is the app's stage key (same as the simulator's), so the stepper and Settings `node_map` keep working. A missing or unknown `node` → `400 unknown_node`.

## 6. Webhook receiver

### 6.1 Endpoint

`POST /api/opus/webhook?node=hm_review_r1` in `src/app/api/opus/webhook/route.ts`, replacing the `501` stub. Wrapped in `handle()`, so it runs inside `withStore()` and the task is saved to Redis in the same request. `GET` and other methods → `405`.

### 6.2 Order of steps and responses

| # | Step | Failure response |
| :--- | :--- | :--- |
| 1 | Integration on (spec 01 env rule) | `503 opus_not_configured` (Opus retries; fix config within the retry window) |
| 2 | The secret equals `OPUS_WEBHOOK_SECRET` (`crypto.timingSafeEqual` on SHA-256 hashes). Taken from the `X-Valiram-Webhook-Secret` header; if the header is absent, from the `secret` query parameter. The header wins when both are sent | `401 unauthorized` |
| 3 | `node` is in `OPUS_NODES` | `400 unknown_node` |
| 4 | Body matches `OpusOffPlatformPayloadSchema` (§6.5) | `400 invalid_payload` |
| 5 | `workflow_id` equals `OPUS_CREATE_REQUISITION_WORKFLOW_ID` | `400 wrong_workflow` |
| 6 | `requisition_id` (`workflow_input_4foftw3r4`) is present and names an existing requisition that has `db.opus_cases[id]` | `422 unknown_requisition`: the step **fails** in Opus at once |
| 7 | Idempotency: a task with the same `execution_id` and `node_id` exists → `200` with that task's ID, nothing created | – |
| 8 | Status guard: the requisition should be `AiPrecheck` round 1. Otherwise log a warning and still create the task (Opus is the source of truth) | – |
| 9 | Create the task and update the requisition (§6.6) | – |
| 10 | `200 { "ok": true, "task_id": "T-…" }` | – |

- No outbound calls before the `200`; only the store write.
- Every rejection is logged with `console.error`: `node`, `execution_id`, `requisition_id` (if read) and the reason. The secret (header or `?secret=`) and `callback.token` are **never** logged by the app.
- The `?secret=` fallback puts the secret in the URL, where Vercel's request logs and the Opus run history can record it. It exists only because the Opus node currently can't send custom headers. Switch back to the header when Opus supports it, and rotate the secret if those logs are shared.

### 6.3 Correlation

- **Requisition:** the `requisition_id` input `workflow_input_4foftw3r4`.
- **Execution:** `execution_id` is **required** and is stored before the `200` (Opus never resends it). It identifies the paused run that the callback must resume:
  - saved on the task (`task.execution_id`), next to the full `callback` block;
  - appended to `db.opus_cases[id].execution_ids` (one requisition can have several over its rounds).
- `execution_id` is not the case ID and is not used to find the requisition.
- Check on receipt: `callback.url` must end with `/callback/<execution_id>`. A mismatch is logged as a warning (the task is still created, using `callback.url` as sent).

### 6.4 Input mapping (webhook → app)

| Input ID (Opus) | Label (front end) | Opus type | App field | Rule |
| :--- | :--- | :--- | :--- | :--- |
| `workflow_input_4foftw3r4` | Requisition ID | `str` | lookup key | Required |
| `workflow_input_5q6u44ygg` | Message to Hiring Manager | `str` | task `message` | Read only. Shown as is (line breaks kept) |
| `workflow_input_sbv9ddudn` | Department | `str` | `department` | |
| `workflow_input_88pemvv0j` | Role | `str` | `role` | |
| `workflow_input_fzyzsdkbx` | Store | `str` | `store_id` | Store **name** → `store_id` via Settings (case-insensitive) |
| `workflow_input_jv3vprocq` | Region | `str` | `region` | Shown only; the form derives region from the store, as on New requisition |
| `workflow_input_es2yy2kmf` | Employment type | `str` | `employment_type` | `Full time` → `Full-time`, `Part time` → `Part-time` (also accepts the hyphenated form) |
| `workflow_input_p369otc5u` | Openings | `float` | `openings` | Integer |
| `workflow_input_7teogziuu` | Target Start Date | `date` | `target_start` | `DD/MM/YYYY` → `YYYY-MM-DD` (also accepts `DD-MM-YYYY` and `YYYY-MM-DD`) |
| `workflow_input_1m2e7eynj` | Base salary from | `float` | `base_min` | |
| `workflow_input_8hck6z17d` | Base salary to | `float` | `base_max` | |
| `workflow_input_tfsihzkom` | About the role | `str` | `jd.about` | |
| `workflow_input_xnqhm8a5n` | What you will do | `str` | `jd.duties` | Split on `\n`, trimmed, blank lines removed |
| `workflow_input_07a8645ub` | What we look for | `str` | `jd.requirements` | As above |
| `workflow_input_3v8672d4o` | Benefits | `str` | `jd.benefits` | Text, line breaks kept |
| `workflow_input_qgtom58kp` | Shift pattern | `str` | `jd.shift_pattern` | Text, line breaks kept |

- Only `requisition_id` and the message are required. A missing, `null` or unparseable field is prefilled from the requisition instead, and logged as a warning.
- A value that doesn't match Settings (unknown store, department or role) is shown as entered; the form makes the hiring manager pick a valid one before submitting.
- Other inputs (`workflow_input_9knpanwdj`, `workflow_input_wli0gftqb`, any new ones) are ignored.
- The map lives in one constant (`HM_REVIEW_INPUTS`: input ID → app field, parser), so a Builder change only touches it.

### 6.5 Payload schema

In `src/server/opus/types.ts` (real Opus shape; the simulator keeps its own `OffPlatformPayload`):

```ts
const OpusValue = z.object({ type: z.string(), value: z.unknown() }).passthrough();

export const OpusOffPlatformPayloadSchema = z.object({
  execution_id: z.string().min(1),
  workflow_id: z.string().min(1),
  workflow_name: z.string(),
  inputs: z.record(OpusValue),
  callback: z.object({ url: z.string().url(), token: z.string().min(1), token_header: z.string().min(1) }),
  expected_output_schema: z.record(z.object({ type: z.string(), is_nullable: z.boolean().optional() }).passthrough()).default({}),
}).passthrough();
```

### 6.6 Task and requisition update

`receiveOpusTask(db, node, payload)` in `src/server/app/webhook.ts`, reusing the steps the simulator does in `runPrecheckStep()` / `returnToHm()` (`src/server/flows.ts`).

**Task** (`TaskRecord`; assignee = the requisition's `hm_user`; title `Revise requisition · <role>`):

| Field | Value |
| :--- | :--- |
| `task_type`, `round`, `node_id` | From `OPUS_NODES.hm_review_r1` |
| `execution_id` | From the payload. Required for the callback on submit (§7.3) |
| `workflow_id`, `workflow_name` | From the payload |
| `callback` | Full block (`url`, `token`, `token_header`), server-side only (`toPublicTask()` strips it) |
| `expected_output_schema` | As received |
| `inputs.message` | Message to Hiring Manager |
| `inputs.prefill` | The mapped values (§6.4) in the shape of `RequisitionInput` (`department`, `role`, `store_id`, `openings`, `base_min`, `base_max`, `employment_type`, `target_start`, `jd`) |
| `inputs.returned_by` | `"AI pre-check"` |
| `inputs.requisition_id` | The REQ ID |
| `source` (new) | `"opus"`; simulator tasks are `"sim"` (default when missing) |

**Requisition:**

- Review round 1: `precheck = { pass: false, at: now, findings: [{ code: "opus_message", result: "fail", title: "Message to Hiring Manager", detail: <message> }] }`, `outcome = "returned"`. This keeps the message in the requisition's review history.
- Fields are **not** overwritten from the payload; they change only when the hiring manager submits.
- `status = "ReturnedToHm"`, `stage_times.ReturnedToHm = now`.
- Activity: "AI pre-check round 1 needs changes. Returned to hiring manager." and "Opus paused at Hiring Manager Review Round 1; task T-… assigned to <HM>."

## 7. Callback (hiring manager submits)

### 7.1 Output mapping (app → Opus)

`output_data` has the 15 IDs below as **bare values**. They are the same IDs and formats the app sends on Create Requisition (spec 01 §6).

| Output ID (Opus) | Label | Type | Value |
| :--- | :--- | :--- | :--- |
| `workflow_input_78r0ypse6` | Department | `str` | As entered |
| `workflow_input_edauqmje5` | Role | `str` | As entered |
| `workflow_input_c2boa99wg` | Store | `str` | Store **name** |
| `workflow_input_pqsxw3kio` | Region | `str` | Region of the store, from Settings |
| `workflow_input_kqinwjdml` | Employment type | `str` | `Full time` or `Part time` |
| `workflow_input_0xzhza9py` | Openings | `float` | Number, e.g. `2` |
| `workflow_input_128uhde7w` | Target Start Date | `date` | `DD/MM/YYYY`, e.g. `17/11/2026` |
| `workflow_input_y7mukgkh9` | Base salary from | `float` | RM per month, e.g. `1800` |
| `workflow_input_al1kdjqqd` | Base salary to | `float` | RM per month, e.g. `2300` |
| `workflow_input_xl67jxp25` | About the role | `str` | Trimmed text |
| `workflow_input_virmywhg8` | What you will do | `str` | Points joined with `\n` |
| `workflow_input_31tedhzgn` | What we look for | `str` | Points joined with `\n` |
| `workflow_input_s3qdueq3e` | Benefits | `str` | Trimmed text |
| `workflow_input_caakchhja` | Shift pattern | `str` | Trimmed text; `""` if empty |
| `workflow_output_zk3o1np3u` | Requisition Id | `str` | The REQ ID, e.g. `REQ-2611-025`. **Not nullable**: without it Opus accepts the callback and then fails the node |

Example:

```json
{
  "output_data": {
    "workflow_input_78r0ypse6": "Retail Operations",
    "workflow_input_edauqmje5": "Retail Sales Associate",
    "workflow_input_c2boa99wg": "Mid Valley Megamall",
    "workflow_input_pqsxw3kio": "KL City",
    "workflow_input_kqinwjdml": "Full time",
    "workflow_input_0xzhza9py": 2,
    "workflow_input_128uhde7w": "17/11/2026",
    "workflow_input_y7mukgkh9": 1800,
    "workflow_input_al1kdjqqd": 2300,
    "workflow_input_xl67jxp25": "Join our store team…",
    "workflow_input_virmywhg8": "Greet customers…\nProcess sales…",
    "workflow_input_31tedhzgn": "At least 1 year…\nGood communication…",
    "workflow_input_s3qdueq3e": "EPF, SOCSO and EIS contributions\n…",
    "workflow_input_caakchhja": "Store open 12pm-6pm…"
  },
  "status": "success"
}
```

The value builder is shared with spec 01 (`CREATE_REQUISITION_INPUTS` value functions), so both directions use one format.

### 7.2 Building and checking `output_data`

The task screen (§8) sends the edited form as `{ requisition: RequisitionInput }` to `POST /api/tasks/{id}/complete`. For a task with `source: "opus"`, `completeTask()`:

1. validates with `RequisitionInputSchema` and the same department / role / store checks as `applyInput()`; errors come back per field like on New requisition;
2. builds the 14 values in §7.1 from the validated input (store and region resolved from Settings);
3. checks the keys against the task's stored `expected_output_schema`: any output ID the app would send that isn't declared → `500 opus_schema_mismatch` (logged with both key lists) and Opus is not called. Declared outputs the app doesn't know are left out if nullable; a declared **non-nullable** output the app doesn't fill → also `500 opus_schema_mismatch`, Opus is not called (Opus would otherwise answer `200` and fail the node);
4. sends `{ "output_data": { … }, "status": "success" }`.

There is no comment field: the hiring manager only edits the requisition. (The server still accepts an optional `hm_note` and keeps it in the app only; the screen no longer sends one.)

### 7.3 Sending

`sendCallback()` (`src/server/app/callbackSender.ts`) chooses by the **task's** `source`, not `DATA_MODE`:

- `"opus"` → the Opus callback API for the task's stored `execution_id`:

  ```http
  POST https://operator.opus.com/v1/execution/callback/{execution_id}
  Content-Type: application/json
  X-Opus-Callback-Token: {callback.token}

  { "output_data": { … }, "status": "success" }
  ```

  The URL is the stored `callback.url` (which is this URL for the task's `execution_id`); the header name is the stored `callback.token_header`. If `callback.url` is missing, the app builds it as `{OPUS_BASE_URL}/v1/execution/callback/{execution_id}`. 10 s timeout, no automatic retry.
- `"sim"` → simulator as today.

The request is logged with `execution_id`, task ID and HTTP status only; the token is never logged.

### 7.4 Responses

| Opus answer | App result |
| :--- | :--- |
| `200` | Task `done`; requisition updated (§7.5). |
| `401` | Task `closed`; the existing "This step is already closed in Opus…" message. |
| `404` | `404 no_such_execution` (existing). |
| `422` | Existing message; task stays open; nothing saved. Logged with the Opus detail. |
| Network error / timeout / other | `502 opus_unavailable` / `504 opus_timeout`: "We couldn't send your changes to Opus. Please try again." Task stays open; the token is unused, so retrying is safe. |

### 7.5 Requisition after a successful callback

- All submitted fields are saved on the requisition (department, role, store, region, employment type, openings, target start, salary range, JD sections), using `applyInput()`.
- Review round 1 `hm = { by, at, note }`; new JD version "Revised after round 1" (with the note, if any).
- `status = "WithHr"`, `stage_times.WithHr = now`. `round` stays `1`. **No** simulator event is queued.
- Activity: "<HM> resubmitted (vN). Sent to Opus; the requisition is now with HR." If fields other than the JD changed, also "Changed: Store, Openings…".
- The status changes **only after Opus answers `200`**. On any other answer the requisition stays `ReturnedToHm` and the task stays open (or closed on `401`).

The HR verification task itself arrives through the next webhook (a later spec). Until then the requisition shows With HR with no HR task, and the Presenter **Advance** action refuses it (`409 opus_driven`, as for `AiPrecheck` in spec 01).

## 8. Task screen (UI change)

For a task with `inputs.prefill` (Opus task), `/tasks/[id]` shows a **Revise requisition** screen built from the **New requisition form**:

- **Message to Hiring Manager** at the top as a read-only information alert (`Alert severity="info"`, title "Message to Hiring Manager", text with line breaks kept). It can't be edited and isn't sent back.
- Below it, the same fields, layout and rules as New requisition, prefilled from `inputs.prefill`: department → role filtered by department, store → region shown from Settings, employment type, openings, target start date, salary range, and the JD sections editor.
- Button **Resubmit**. Field errors show under the fields as on New requisition; Opus errors use the existing alert / closed banner (`ClosedBanner`, `toSubmitError`).
- After submit, the existing "sent" state; a done or closed task shows read only.

Implementation: move the field section of `src/app/requisitions/new/page.tsx` into a shared `src/components/RequisitionFormFields.tsx` (form state type, `fromReq`-style prefill, validation display). New requisition uses it unchanged in look and behaviour; `HmReviseTask.tsx` uses it for Opus tasks. Simulator tasks (no `prefill`) keep today's JD-only screen. The "Variant, TBC" warning is not shown on Opus tasks. `src/lib/api.ts` `tasks.complete()` already takes any output object; its type is widened for the new body.

## 9. Spec 01 changes (same formats in both directions)

Spec 01 §6 now sends:

- **Employment type** as `Full time` / `Part time` (was `Full-time` / `Part-time`);
- **Target Start Date** as `DD/MM/YYYY` (was `YYYY-MM-DD`);
- **Requisition ID** as `workflow_input_ws7sv258o`.

The app keeps storing `Full-time` / `Part-time` and `YYYY-MM-DD` internally; conversion happens only at the Opus boundary, in `CREATE_REQUISITION_INPUTS`.

## 10. Code changes

| File | Change |
| :--- | :--- |
| `src/server/app/createRequisitionCase.ts` | Add Requisition ID input; employment type and date formats (§9). Export the value builder for §7.1. |
| `src/server/app/opusNodes.ts` (new) | `OPUS_NODES`, `HM_REVIEW_INPUTS`, `HM_REVIEW_OUTPUTS` (§5, §6.4, §7.1) and the format parsers. |
| `src/server/opus/types.ts` | `OpusOffPlatformPayloadSchema` (§6.5). |
| `src/server/app/webhook.ts` | `receiveOpusTask()` (§6.6); `receiveOffPlatformTask()` stays for the simulator. |
| `src/server/flows.ts` | Export helpers shared by both paths (record pre-check result, return to HM without `pauseOffPlatform`, resubmit without `startPrecheck`). |
| `src/app/api/opus/webhook/route.ts` | Real receiver (§6.2). |
| `src/domain/schemas.ts` | `TaskRecord.source: "opus" \| "sim"` (optional, default `"sim"`). |
| `src/server/app/callbackSender.ts` | Path by `task.source`; timeout and error mapping (§7.3). |
| `src/server/service.ts` | `completeTask()` for Opus tasks (§7.2, §7.5); `applyInput()` reused for the update. `demoAdvance` refuses Opus-backed requisitions in `AiPrecheck`, `ReturnedToHm` and `WithHr` (`409 opus_driven`). |
| `src/server/store.ts` | `OpusCaseRecord.execution_ids?: string[]`. |
| `src/components/RequisitionFormFields.tsx` (new) | Shared form fields (§8). |
| `src/app/requisitions/new/page.tsx` | Uses `RequisitionFormFields`; no visible change. |
| `src/components/tasks/HmReviseTask.tsx` | Opus variant (§8). |
| `src/lib/api.ts` | Widen the `tasks.complete()` body type. |
| `.env.example`, `README.md` | `OPUS_WEBHOOK_SECRET` comment; webhook URL and setup steps. |

## 11. How to test

1. **Locally, without Opus:** set the three env vars, give a requisition an `opus_cases` entry (submit one, or edit a seeded one), then `curl -X POST "http://localhost:3000/api/opus/webhook?node=hm_review_r1" -H "X-Valiram-Webhook-Secret: …" -H "content-type: application/json" --data @sample-hm-review-r1.json`, using the sample body with `"workflow_input_4foftw3r4": { "type": "str", "value": "REQ-…" }` added. Check the task screen and status. The callback goes to the real Opus URL with a spent token, so it tests the `401` "task closed" path.
2. **End-to-end:** deploy to Vercel, set the Builder URL, submit a requisition with a shift pattern that contradicts itself (as in the sample), and watch the Vercel logs for the webhook. Save the first real payload (token removed) as the reference sample.

## 12. Acceptance criteria

1. With the integration on, when Opus reaches the node, the hiring manager gets an open task "Revise requisition · <role>", and the requisition shows **Returned to HM, round 1**.
2. The task screen shows the Message to Hiring Manager read only, with line breaks, and all other fields prefilled from the webhook (store name matched to the store, `Full time` shown as Full-time, `17/11/2026` shown as 17 Nov 2026).
3. A wrong or missing secret (header, or `?secret=` when no header is sent) → `401`, nothing created.
4. An unknown `node`, invalid body or other workflow ID → `400`, nothing created.
5. A missing or unknown `requisition_id`, or a requisition with no Opus case → `422`, nothing created, the step fails in Opus.
6. The same payload sent twice creates one task.
7. The webhook answers in under 2 s on Vercel.
8. On Resubmit, the app POSTs to `…/v1/execution/callback/<execution_id>` of that task with the stored token; Opus receives exactly the 14 output IDs with bare values in the §7.1 formats and returns `200`; the task is done, and the requisition holds the edited fields with status **With HR**.
8a. If the callback fails (network error, `422`, timeout), the requisition stays **Returned to HM** and the task stays open.
8b. The webhook stores `execution_id` on the task and in `opus_cases[id].execution_ids`; a payload without `execution_id` is rejected with `400`.
9. Invalid form input (e.g. role not in the department, fewer than 3 duties) shows field errors, and Opus is not called.
10. A spent token shows "This step is already closed in Opus" and closes the task.
11. Create Requisition sends `Full time` / `Part time`, `DD/MM/YYYY` and the requisition ID (spec 01).
12. `callback.token`, `callback.url` and the webhook secret appear in no API response, page or app log line (with the `?secret=` fallback the URL itself still appears in Vercel's request logs, §6.2).
13. With the integration off, the simulator behaves as today; `/api/opus/webhook` returns `503`. New requisition looks and works as before.
14. `npm run lint` and `npx tsc --noEmit` pass.

## 13. Decisions

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | How the webhook finds the requisition | Node input `workflow_input_4foftw3r4` (`str`) = requisition ID. Create Requisition sends it as `workflow_input_ws7sv258o`. |
| 2 | `workflow_input_9knpanwdj` (node name), `workflow_input_wli0gftqb` (round) | Not mapped. The node is identified by its webhook URL. |
| 3 | Message to Hiring Manager | Shown read only; not sent back. |
| 4 | What the hiring manager can change | All 14 fields, on the New requisition form (§8). |
| 5 | Value formats to Opus | As Opus sends them: `Full time` / `Part time`, date `DD/MM/YYYY`. Spec 01 changed to match (§9). |
| 6 | Unknown requisition | `422`, step fails. |
| 7 | `execution_id` | Different from the case ID. Stored from the payload (task + `opus_cases`) and used to call the callback API on submit (§7.3). |
| 9 | Status after a successful submit | `WithHr` (round stays 1), set only after Opus answers `200` (§7.5). |
| 8 | Opus organisation verification | Not tracked in this spec. |
| 10 | Opus node can't send custom headers (found while testing on the preview) | The app also accepts the secret as `?secret=`; Vercel's bypass secret goes in the URL as `x-vercel-protection-bypass=`. Header remains the preferred option. |
