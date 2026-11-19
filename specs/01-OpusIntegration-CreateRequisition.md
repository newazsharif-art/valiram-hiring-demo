# 01 · Opus Integration · Create Requisition

| | |
| :--- | :--- |
| **Status** | Ready for build (all open questions resolved) |
| **Date** | 2026-11-19 (MYT) |
| **Scope** | Backend only. No change to UI design or display. |
| **Opus workflow** | `6576e72f-39e0-4e0d-b3e3-38f7ef1c931a` (taken from env) |
| **Opus API** | v1 Case API: [Initiate Case](https://developer.opus.com/api-reference/v1-case/initiate-case), [Execute Case](https://developer.opus.com/api-reference/v1-case/execute-case) |

## 1. Goal

When a hiring manager submits a requisition, the app backend creates a **case** in Opus for the "Create Requisition" workflow and sends it the requisition's form values as workflow inputs. The `caseId` that Opus returns is saved in the app store (persisted to Redis on Vercel), so a later spec can use it to track the case status.

The Opus case is a precondition of the requisition: **if any Opus API call fails, the requisition is not created and the user gets an error message they can understand.**

When the case is created, the requisition is saved with status **`AiPrecheck`** (AI pre-check) and stays there. The app does not run its simulated pre-check for it. Its next status comes from the Opus **Off-Platform webhook**, sent when the workflow reaches a human review node (§8.3).

## 2. Out of scope

- No change to any page, component, layout or text for the Opus integration (the draft removal in §2.1 is the one UI change). The requisition list, the requisition detail page and the activity log **do not show** the case ID. Error messages use the error alert the New requisition page already has (§8.2).
- No case status tracking or polling (`GET /api/v1/case/{caseId}/status`). That comes in a later spec, which will use the saved `caseId`.
- No Opus `callbackUrl`. The Off-Platform webhook receiver that moves the status on from `AiPrecheck` is a follow-up spec (§8.3).
- For a requisition with a real Opus case, the simulator no longer runs the AI pre-check (§8.3). It still creates its Flow 1 job record so the existing screens keep working. With the integration off, the simulator drives the whole demo flow as before.
- File inputs and the Opus File API are not used. All mapped inputs are plain values.

### 2.1 Drafts removed

Requisitions no longer have drafts. This was a separate change made alongside this spec; it is the only UI change, and it is recorded here because it changes when Opus is called.

- The `Draft` status is removed from `RequisitionStatusSchema`, and the `action: "draft" | "submit"` field is removed from `RequisitionInputSchema`. Every create request is a submit.
- **Save draft**, **Continue draft**, the draft-editing endpoint (`PUT /api/requisitions/{id}`) and `updateDraft()` are removed.
- **Copy to new requisition** no longer creates a draft. It opens the New requisition form prefilled from the source (`/requisitions/new?copy=REQ-…`), and nothing is saved until the hiring manager clicks **Submit to HR**. The copy endpoint (`POST /api/requisitions/{id}/copy`) and `copyRequisition()` are removed.
- The create request carries `copied_from` when it comes from a copy. The backend only accepts it for the hiring manager's own requisition with status `Rejected`; otherwise it returns `400` with field `copied_from`. After a successful submit, the source requisition's activity log records "… copied this requisition to REQ-…".
- `applyInput()` always validates department, role and store, since there is no draft path with partial data any more.
- **Deploying this change:** requisitions already stored in Redis with status `Draft` no longer match the schema and would stop the requisition list loading. Run a `/demo` reset after deploying (or remove those records from `valiram:db`).

## 3. Trigger

| User action | Opus call? |
| :--- | :--- |
| **Submit to HR** on the New requisition form (`POST /api/requisitions`) | Yes |
| **Submit to HR** on a form prefilled by **Copy to new requisition** (`POST /api/requisitions` with `copied_from`) | Yes. It creates a new requisition ID and a new case. |
| Opening **Copy to new requisition** (`/requisitions/new?copy=REQ-…`) | No. It only prefills the form; nothing is saved. |
| Seed data and `/demo` reset | No. Seeded requisitions have no case. |

Requisitions are created only by submitting, once each, so every requisition gets at most one case.

## 4. Configuration (env, server-side only)

| Variable | Purpose | Example |
| :--- | :--- | :--- |
| `OPUS_BASE_URL` | Opus API base URL (already in `.env.example`) | `https://operator.opus.com` |
| `OPUS_SERVICE_KEY` | Value of the `x-service-key` header (already in `.env.example`) | *(secret)* |
| `OPUS_CREATE_REQUISITION_WORKFLOW_ID` | Workflow ID for this flow (**new**) | `6576e72f-39e0-4e0d-b3e3-38f7ef1c931a` |

- These variables never get a `NEXT_PUBLIC_` prefix and are never sent to the browser.
- **Both `OPUS_SERVICE_KEY` and `OPUS_CREATE_REQUISITION_WORKFLOW_ID` unset:** the integration is off and submit works exactly as it does today. This keeps local dev working without a key.
- **Only one of them set:** treated as a configuration error. Submit fails with the "not configured" message (§8.2), so a half-configured deployment never submits requisitions silently without Opus.
- On Vercel, set all three variables in Project → Settings → Environment Variables (Production and Preview), then redeploy.
- `.env.example` gets the new variable with a comment.

## 5. Opus API calls

The flow takes two calls, in this order, inside the submit request.

### 5.1 Initiate case

```http
POST {OPUS_BASE_URL}/api/v1/case
Content-Type: application/json
x-service-key: {OPUS_SERVICE_KEY}

{
  "workflowId": "{OPUS_CREATE_REQUISITION_WORKFLOW_ID}",
  "title": "REQ-2611-004 · Fragrance Specialist · KLIA2 Departures",
  "description": "Requisition REQ-2611-004 submitted by Jason Lim"
}
```

Response `201`: `{ "caseId": "<CASE_ID>" }`. Errors: `401` (bad or expired key), `404` (workflow not found).

### 5.2 Execute case

```http
POST {OPUS_BASE_URL}/api/v1/case/{caseId}/execute
Content-Type: application/json
x-service-key: {OPUS_SERVICE_KEY}

{ "payload": { ...see §6... } }
```

Response `201`: `{ "success": true, "caseId": "...", "message": "Job execution started" }`. Errors: `401`, `404`. Execution is asynchronous: Opus returns as soon as the run is queued.

A response counts as successful only if the HTTP status is 2xx **and** the body has the expected field: `caseId` for Initiate, `success: true` for Execute. Anything else is a failure (§8).

## 6. Input mapping

Each payload entry has the Opus shape `{ "value": ..., "type": ..., "displayName": ... }`. The `displayName` is the front-end label in the table below.

| Input ID (Opus) | Label (front end) | Source (`Requisition`) | Opus `type` | Value rule |
| :--- | :--- | :--- | :--- | :--- |
| `workflow_input_78r0ypse6` | Department | `department` | `str` | As entered |
| `workflow_input_edauqmje5` | Role | `role` | `str` | As entered |
| `workflow_input_c2boa99wg` | Store | `store` | `str` | Store **name** (e.g. "KLIA2 Departures"), not `store_id` |
| `workflow_input_pqsxw3kio` | Region | `region` | `str` | Region of the store, from Settings |
| `workflow_input_kqinwjdml` | Employment type | `employment_type` | `str` | `Full time` or `Part time` (the app stores `Full-time` / `Part-time`; same format Opus sends back, spec 02) |
| `workflow_input_0xzhza9py` | Openings | `openings` | `float` | Number, e.g. `3` |
| `workflow_input_128uhde7w` | Target Start Date | `target_start` | `date` | `DD/MM/YYYY`, e.g. `17/11/2026` (app stores `YYYY-MM-DD`; same format Opus sends back, spec 02) |
| `workflow_input_y7mukgkh9` | Base salary from | `base_min` | `float` | RM per month, no separators, e.g. `1900` |
| `workflow_input_al1kdjqqd` | Base salary to | `base_max` | `float` | RM per month, e.g. `2300` |
| `workflow_input_xl67jxp25` | About the role | `jd_sections.about` | `str` | Trimmed text |
| `workflow_input_virmywhg8` | What you will do | `jd_sections.duties` | `str` | Points joined with `\n`, one per line |
| `workflow_input_31tedhzgn` | What we look for | `jd_sections.requirements` | `str` | Points joined with `\n`, one per line |
| `workflow_input_s3qdueq3e` | Benefits | `jd_sections.benefits` | `str` | Trimmed text |
| `workflow_input_caakchhja` | Shift pattern | `jd_sections.shift_pattern` | `str` | Trimmed text; `""` if not given (optional field) |
| `workflow_input_ws7sv258o` | Requisition ID | `id` | `str` | `REQ-YYMM-nnn`. Added by spec 02: Opus passes it to the Off-Platform review nodes so the webhook can find the requisition. |

The values are built from the requisition **as it will be saved**: the same normalisation `applyInput()` does (trimmed text, empty list points removed, store and region resolved from Settings).

> **Confirmed against the workflow:** every input is a text input in Opus (`str`), except Target Start Date (`date`) and Openings, Base salary from and Base salary to (number, sent as `float`, the Opus API's numeric type). "What you will do" and "What we look for" are text, so their points are sent newline-separated. Store is sent as the store **name**, not the store code.

The mapping lives in one constant (input ID → label, source, type) so a later workflow change only touches that constant.

## 7. Storage of the case ID

The case ID is stored server-side in the app `Db`. The whole `Db` is persisted to Upstash Redis (`valiram:db`) by `withStore()` on Vercel, so the case ID lands in Redis with no extra Redis code.

New `Db` collection (not part of `Requisition`, so it is never returned by `/api/requisitions` and never reaches the browser):

```ts
// src/server/store.ts
export interface OpusCaseRecord {
  requisition_id: string;   // REQ-YYMM-nnn
  flow: "create_requisition";
  workflow_id: string;
  case_id: string;
  created_at: string;       // ISO UTC; display in MYT when shown later
}

export interface Db {
  // ...existing fields
  /** Real Opus cases started by the app, keyed by requisition ID. Server-only. */
  opus_cases: Record<string, OpusCaseRecord>;
}
```

- A record is written only when **both** calls succeed, in the same request that saves the submitted requisition. A failed submit leaves nothing in `opus_cases`.
- `seed()` returns `opus_cases: {}`. A `/demo` reset therefore clears saved cases, the same as all other demo data.
- A `Db` loaded from Redis that has no `opus_cases` yet (created before this change) is treated as `{}`.

## 8. Behaviour and error handling

### 8.1 Order of steps

The Opus calls run **before** anything is written to the store, so a failure leaves no trace in the app data.

1. Validate the input as today (`RequisitionInputSchema` + department/role/store checks). Validation errors are returned as today, without calling Opus.
2. Work out the requisition ID: the next `REQ-YYMM-nnn` (not yet reserved). For a copy, also check `copied_from` (§2.1).
3. Build the requisition values in memory (as in §6) and the Opus payload from them.
4. **Initiate Case**, then **Execute Case**.
5. Only if both succeed: add the requisition to the store, run `submitRequisition()` with `simulatePrecheck: false` (status saved as `AiPrecheck`, §8.3), and write `db.opus_cases[id]`.
6. Respond with the requisition exactly as today.

If step 4 fails, steps 5 and 6 don't happen and the API returns an error (§8.2):

| Case | Result |
| :--- | :--- |
| New requisition | Nothing is created and the REQ number is not used up. The form keeps everything the user typed, so they can try again. |
| Submitting a copy | Nothing is created and the source requisition is unchanged (no "copied to" entry). The form keeps the prefilled and edited values. |
| Initiate succeeded, Execute failed | Same as above for the app. The case created in Opus is left unexecuted (Opus can't cancel a case that was never executed: Cancel returns `400`). This is accepted; no clean-up is needed. The server log records its `caseId` as orphaned. A retry creates a new case. |

### 8.2 Error messages

The API returns an `ApiError` with HTTP status **502** (Opus error) or **504** (timeout) and a plain-language `message`. The New requisition page already shows `message` in its red error alert at the top of the form, so no UI change is needed.

| Cause | Code | Message shown to the user |
| :--- | :--- | :--- |
| Opus not reachable (network error, DNS, 5xx) | `opus_unavailable` | "We couldn't reach Opus to start the hiring workflow, so the requisition wasn't submitted. Please try again in a few minutes." |
| Timeout (no answer within 10 s) | `opus_timeout` | "Opus took too long to respond, so the requisition wasn't submitted. Please try again." |
| `401` from Opus (key missing, wrong or expired) | `opus_auth` | "The app couldn't sign in to Opus, so the requisition wasn't submitted. Please contact your system administrator." |
| `404` from Initiate (workflow not found or not active) | `opus_workflow_not_found` | "The hiring workflow couldn't be found in Opus, so the requisition wasn't submitted. Please contact your system administrator." |
| Execute rejected the inputs (`4xx` other than 401, or `success` not `true`) | `opus_rejected` | "Opus didn't accept the requisition details, so it wasn't submitted. Please check the form and try again, or contact your system administrator." |
| Unexpected response (missing `caseId`, invalid JSON) | `opus_unavailable` | Same as "not reachable". |
| Only one of the two env vars set (§4) | `opus_not_configured` | "The Opus connection isn't set up, so the requisition wasn't submitted. Please contact your system administrator." |

Rules:

- Messages never include the service key, workflow ID, HTTP details or raw Opus error text.
- Every failure is logged on the server with `console.error`: requisition ID, step (`initiate` / `execute`), HTTP status, Opus error body (truncated), and the `caseId` if Initiate had succeeded. The service key and the full payload are never logged.
- Each Opus call has a **10 s timeout** (`AbortSignal.timeout`). No automatic retry: a retried Initiate could create a duplicate case. The user retries by clicking **Submit to HR** again.

### 8.3 Status after submit

| Integration | Status saved by submit | What moves it on |
| :--- | :--- | :--- |
| **On** (Opus case created) | `AiPrecheck` (stage time `stage_times.AiPrecheck` recorded) | The Opus **Off-Platform webhook**: when the workflow reaches a human review node, Opus POSTs the task to the app, and the app sets the status from it (e.g. HR verification → `WithHr`, revise JD → `ReturnedToHm`). Receiver to be built in a follow-up spec. |
| **Off** (no env vars) | `AiPrecheck` | The simulator, as before: after `SIM_DELAY_MS` the simulated pre-check sets `WithHr`, `ReturnedToHm` or `Rejected`. |

Rules:

- `submitRequisition()` takes `{ simulatePrecheck }`. With a real case it is `false`: the status is set to `AiPrecheck` but no simulated pre-check event is queued in `db.events`, so `tick()` never changes it.
- The Presenter panel's **Advance** action refuses an Opus-backed requisition in `AiPrecheck` with `409 opus_driven` ("This requisition runs on the real Opus workflow. Its status changes when Opus reaches a review step, not from the simulator."). Its status must only come from Opus.
- Until the webhook receiver is built, an Opus-backed requisition stays in `AiPrecheck`.

## 9. Code changes

Keep the existing layering (see `CLAUDE.md`).

| File | Change |
| :--- | :--- |
| `src/server/opus/caseClient.ts` (new) | Real Opus v1 Case API client: `initiateCase({ workflowId, title, description })` and `executeCase(caseId, payload)`. Reads `OPUS_BASE_URL` and `OPUS_SERVICE_KEY`, sends the `x-service-key` header, 10 s timeout. Throws an `OpusApiError` with the step, HTTP status (if any) and kind (`network`, `timeout`, `http`, `bad_response`). Imports `"server-only"`. |
| `src/server/app/createRequisitionCase.ts` (new) | App side: `CREATE_REQUISITION_INPUTS` mapping (§6), `buildPayload(values)`, and `startCreateRequisitionCase(...)`, which checks the config (§4), makes both calls, logs failures, and turns an `OpusApiError` into an `ApiError` with the code and message from §8.2. Returns the `caseId`. |
| `src/server/store.ts` | Add `OpusCaseRecord`, `Db.opus_cases`, seed it as `{}`, default it when an older `Db` is loaded from Redis. |
| `src/server/service.ts` | `createRequisition()` becomes `async`. It validates (including `copied_from`, §2.1), builds the requisition in memory with `applyInput()` (which only writes to the new record, not the store), `await startCreateRequisitionCase()`, and only then pushes the requisition, calls `submitRequisition()` and saves `db.opus_cases[id]` (§8.1). `updateDraft()` and `copyRequisition()` are removed (§2.1). |
| `src/server/flows.ts` | `submitRequisition(db, r, actor, { simulatePrecheck })`: with `false`, set `AiPrecheck` without scheduling the simulated pre-check (§8.3). |
| `src/server/service.ts` (`demoAdvance`) | Refuse `AiPrecheck` requisitions that have an Opus case (`409 opus_driven`). |
| `src/app/api/requisitions/route.ts` | `POST` awaits the now-async `createRequisition()`. They already run inside `handle()` → `withStore()`, so a successful submit and its case record are saved to Redis together, and a failed one saves nothing. |
| `src/server/http.ts` | No change expected: `handle()` already maps `ApiError` to `{ error, message }` with its status. |
| `.env.example` | Add `OPUS_CREATE_REQUISITION_WORKFLOW_ID`. |
| `README.md` | Short note in "Real Opus integration": submitting a requisition now starts a real Opus case when the env vars are set, and fails with a clear message if Opus can't be reached. |

**Unchanged by the Opus integration:** the `Requisition` fields, `src/lib/api.ts`, all pages and components, and the simulator (`src/server/opus/simulator.ts`). The draft removal (§2.1) separately changes `src/domain/schemas.ts`, `src/lib/api.ts`, the New requisition and requisition detail pages, and deletes `src/app/api/requisitions/[id]/copy/route.ts` and the `PUT` handler in `src/app/api/requisitions/[id]/route.ts`.

The Opus calls run inside `withStore()`, which serialises requests per instance, so other requests on the same instance wait for up to 2 × 10 s in the worst case. That's acceptable for a presenter-driven demo. Because requests are serialised, the REQ number worked out in step 2 can't be taken by another request on the same instance before step 5.

## 10. Acceptance criteria

1. With the three env vars set, submitting a new requisition creates one case in Opus for workflow `6576e72f-…`, titled `REQ-… · <role> · <store>`, with all 15 inputs filled as in §6.
2. Submitting a form opened with **Copy to new requisition** does the same, for a new REQ ID. Opening the copy form creates nothing.
3. After a successful submit, `db.opus_cases["REQ-…"]` in Redis (`valiram:db`) holds the `case_id`.
4. The `caseId` does not appear in any `/api/requisitions` or `/api/tasks` response, or anywhere in the UI.
5. On success, all pages look and behave exactly as before, including the success message after submit.
6. With a wrong service key, the New requisition page shows the "couldn't sign in to Opus" message; no requisition is created, the requisition list is unchanged, and the next successful submit gets the REQ number that the failed one would have had.
7. With a wrong workflow ID, the page shows the "workflow couldn't be found" message and nothing is created.
8. When submitting a copy fails, nothing is created, the source requisition's activity log is unchanged, and the form still holds the values.
9. With Opus unreachable or slow (e.g. `OPUS_BASE_URL` pointing to an unreachable host), the page shows the "couldn't reach Opus" or "took too long" message within about 10 s per call, and nothing is created.
10. With both env vars unset (local dev), the app behaves exactly as it does today. With only one set, submit fails with the "isn't set up" message.
11. No error message shown to the user contains the key, workflow ID or raw Opus response.
12. With the integration on, a submitted requisition is saved as `AiPrecheck` and is still `AiPrecheck` after `SIM_DELAY_MS` has passed. Presenter **Advance** on it returns `409 opus_driven`.
13. With the integration off, a submitted requisition is saved as `AiPrecheck` and the simulator moves it on as before.
14. `npm run lint` and `npx tsc --noEmit` pass.

## 11. Decisions (resolved questions)

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | Declared Opus type of each input | All inputs are text (`str`) except Target Start Date (`date`) and Openings, Base salary from, Base salary to (number → `float`). List fields are sent newline-separated (§6). |
| 2 | Store value | Opus expects the store **name** (e.g. "KLIA2 Departures"), not the store code (`klia2`). |
| 3 | Case title and description | The proposed format is accepted: title `REQ-… · <role> · <store>`, description `Requisition REQ-… submitted by <HM name>` (§5.1). |
| 4 | Orphaned cases (Initiate succeeded, Execute failed) | Accepted. The unexecuted case stays in Opus with no clean-up; the server log records its `caseId` (§8.1). |
| 5 | Status after submit | Saved as `AiPrecheck`. With a real Opus case, the status is then only updated through the Opus Off-Platform webhook when the workflow is at a human review node; the simulated pre-check does not run (§8.3). |
| 6 | Value formats (changed by spec 02) | Employment type `Full time` / `Part time` and Target Start Date `DD/MM/YYYY`, matching what Opus sends to the Off-Platform nodes. Requisition ID added as `workflow_input_ws7sv258o`. |

No open questions remain.
