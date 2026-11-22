# Valiram Hiring: demo web app (Flow 1 and Flow 1b)

Runnable frontend for the Valiram × Opus recruitment demo, built from the Claude Design mockup
(10 screens, dark Material UI). It runs against an **in-app mock backend with an Opus simulator**,
shaped like the future backend, so a real Opus integration can replace it without UI changes.

Source of truth for behaviour: `../requirement_analysis/valiram-opus-recruitment-context.md` (v6, sections 4, 5 and 9).

Stack: Next.js 15 (App Router) · React 19 · TypeScript · MUI v6 (dark default, light toggle) · zod · date-fns-tz (all times in MYT) · pdf-lib.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npx tsc --noEmit
npm run build && npm start
```

Optional settings: copy `.env.example` to `.env.local` (`SIM_DELAY_MS`, `NEXT_PUBLIC_SHOW_SOURCES`, `DATA_MODE`).
Data lives in memory: restarting the server, or **Presenter panel → Reset demo data**, restores the starting state.

## Deploy to Vercel

Serverless instances don't share memory, so on Vercel the store is kept as one JSON value in Upstash Redis
(`withStore()` in `src/server/store.ts`: load per API request, save if changed).

1. vercel.com → **Add New → Project** → import this GitHub repo (Next.js defaults).
2. Project → **Storage** → Marketplace → **Upstash Redis** (free plan, Singapore) → connect. This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. Redeploy. Every push to `main` deploys again.

All viewers share one data set; **Reset demo data** resets it for everyone.

**Roles.** There is no sign-in. Use the user menu (top right) to switch between the three demo personas.
The choice is kept in a `vh_user` cookie.

| Persona | Role | Sees |
|---|---|---|
| Siti Rahman | HR recruiter (default) | Home, My tasks (HR verification, Shortlist review), all Requisitions, Candidates, Settings (read-only) |
| Jason Lim | Hiring manager | Home, My tasks (Revise JD, Rejected notices with "Copy to new"), own Requisitions, New requisition |
| Aaron Wong | HR admin | Home, Requisitions, Candidates, Settings (editable) |

## Routes

| Route | Screen |
|---|---|
| `/` | Home: counters, Waiting for me, Recent activity, open requisitions |
| `/requisitions` | Requisitions: stage filter chips with counts, search, table with Department |
| `/requisitions/new` | New requisition (HM): Department* → Role*, Store → Region, openings, base range (min ≤ max), target start, JD section boxes, fixed How to apply. Submit to HR. `?copy=REQ-…` prefills the form from a rejected requisition ("Copy to new") |
| `/requisitions/[id]` | Requisition detail: Flow 1 stepper; tabs Overview, JD & versions, Review history, Job posting (preview, embedded PDF, Open / Download), Activity (MYT) |
| `/requisitions/[id]/candidates`, `/candidates` | Candidates & shortlist (Flow 1b): stepper, 3 band cards, filterable table |
| `/tasks` | My tasks: Open / Completed, per role |
| `/tasks/[id]` | Task screen chosen by task type: HR verification (`HR_JD_CHECK`), HM revise (`HM_JD_REVISE`, the TBC variant), Shortlist review (`SHORTLIST_REVIEW`). States: open, done, closed (callback 401) |
| `/settings` | Stores & regions, Departments & roles, Shortlist rules, JD template, Users & roles, Connections, Opus step mapping |
| `/demo` | Presenter panel: reset data, pre-check outcome (rule-based / force pass / force fail), close KitaHQ screening (starts Flow 1b), finish a pending step now, re-send a callback (shows the 401) |

API (all JSON unless noted; the current user comes from the `vh_user` cookie):

| Method and path | Purpose |
|---|---|
| `GET /api/requisitions?status=&q=` · `POST /api/requisitions` | List (role-scoped) · submit (creates the REQ and starts Flow 1; optional `copied_from` = own Rejected REQ) |
| `GET /api/requisitions/{id}` | Detail |
| `GET /api/requisitions/{id}/posting.pdf[?download=1]` | Job post PDF (`application/pdf`) |
| `GET /api/requisitions/{id}/candidates` | Candidates (HR only) |
| `GET /api/tasks?status=open\|done\|all` · `GET /api/tasks/{id}` | Tasks for the current user (no callback token in responses) |
| `POST /api/tasks/{id}/complete` | Body `{"output_data": {…bare values…}}`. The app sends the Off-Platform callback. **401** task closed (token spent), **422** undeclared output field or wrapped `{value,type}` value, 400 app validation (e.g. comment required) |
| `GET/PUT /api/settings` | Master data (PUT: HR admin only) |
| `GET /api/demo/state` · `POST /api/demo/{reset\|precheck\|close-screening\|advance}` | Presenter actions |
| `POST /api/opus-sim/callback/{executionId}` | Simulated Opus callback endpoint (header `X-Opus-Callback-Token`) |
| `GET /api/opus-sim/jobs/{id}/audit` | Simulated `GET /job/{id}/audit` (no timestamps, like the real one) |
| `POST /api/opus/webhook?node=hm_review_r1` / `?node=hr_review_r1` | Real Opus Off-Platform webhook (spec 02, spec 03). Header `X-Valiram-Webhook-Secret` (or `&secret=` if Opus can't send headers). 503 when the integration is off |

## How the simulator behaves

**Flow 1 · Publish JD.**
- Submit: the app creates the REQ (`REQ-YYMM-nnn`), starts a Flow 1 job, and records the job ID.
- AI pre-check: runs after `SIM_DELAY_MS`. It is rule-based (`src/server/precheck.ts`) and checks:
  - at least 3 duties;
  - age, gender, race, religion, nationality, marital status and looks wording;
  - CV, degree and SPM demands;
  - salary, phone, email or links in the text;
  - placeholders and one-word duties.

  A missing shift pattern is advisory only.
- Pass: Opus pauses at an Off-Platform node and "POSTs" an `HR_JD_CHECK` task to the app.
- Fail: an `HM_JD_REVISE` task goes to the HM.
- HR approve: optional inline edits become a new published JD version. Then the Job posting step runs: the PDF is generated in a LinkedIn-style layout, with no LinkedIn logo, name or colours. The JD goes live.
- HR return: comment required. An `HM_JD_REVISE` task goes to the HM; their resubmission starts round n+1.
- Not approved after round 3: the requisition is **Rejected**. This happens when HR rejects in round 3 (the option reads "Reject requisition", comment required), or when the pre-check fails in round 3. The HM can then use **Copy to new requisition**, which opens the New requisition form prefilled; submitting it creates a new REQ with 3 new rounds.

**Flow 1b · Shortlist.** Presenter panel → **Close KitaHQ screening** on a live requisition.
- Scores are banded with the Settings thresholds:
  - ≥90: shortlisted automatically, email sent and Flow 2a started straight away;
  - 70–89: a `SHORTLIST_REVIEW` task for HR;
  - <70: regret email.
- When the task is completed, selected candidates become *Shortlisted by HR* (`flow2a_started`) and the rest *Not selected* (regret).
- If the 70–89 band is empty, the HR step is skipped.
- REQ-2611-001 starts in the mockup state: 2 / 6 / 14, waiting for HR review (task T-0001). Re-running "close screening" restarts it.

**Off-Platform rules mimicked.**
- The callback token is single-use and stays server-side.
- Completing a task twice → 401 → the UI shows "This step is already closed in Opus".
- Undeclared output fields → 422, and nothing is stored.
- Values must be bare.

## Demo script

Reset first (`/demo` → Reset demo data). The pre-check delay is about 2.5 s; pages refresh by themselves.

1. **Flow 1 happy path**
   1. User menu → **Jason Lim**.
   2. Open **New requisition** → **Fill example** (or type your own) → **Submit to HR**. You see "Submitted as REQ-2611-009 … Opus job … started".
   3. Click **Track progress**: the stepper shows AI pre-check, then HR verification.
   4. Switch to **Siti Rahman** → **My tasks** → **Review** the new "Verify JD".
   5. Optionally edit a section → **Approve** → **Send decision to Opus**.
   6. Open the requisition: Job posting, then **Live**. On the **Job posting** tab, **Open PDF** / **Download** works. **JD & versions** shows the HR edit as the published version.
2. **Return → revise**
   1. Return: as Siti, **Review** the Verify JD task for the requisition Jason created in step 1 (or create another one) → **Return to hiring manager**. Try sending without a comment first: the comment is required. Then add a comment and send.
   2. Revise: as **Jason**, **My tasks** → **Revise** (HR comments shown) → **Resubmit to Opus**. The requisition goes to round 2: AI pre-check, then a new Verify JD task for Siti.
   3. The seeded REQ-2611-003 works the same way. It is already at round 2 of 3, with Jason's Revise task open.
3. **Round-3 reject**
   - As Jason, resubmit REQ-2611-003 (round 2 → 3). As Siti, open its round-3 Verify JD task. The option now reads **Reject requisition** (comment required) → send. REQ-2611-003 is **Rejected**.
   - As Jason, **My tasks → Completed** → **Copy to new**. The form opens prefilled ("Copied from …").
   - Quick alternative: `/demo` → **Force fail**, then submit a new requisition as Jason and resubmit twice. The third failure rejects it.
4. **Flow 1b review**
   1. As Siti, open **Candidates**. REQ-2611-001 shows 2 / 6 / 14, waiting for HR review.
   2. **Open review task** → tick Mei Chen, Daniel Raj and Ravi Kumar → **Send selection to Opus**.
   3. The candidates page shows *Shortlist complete · 5 in Flow 2a*: 3 shortlisted by HR, 3 not selected, 14 regret.
   4. For a fresh run: `/demo` → **Close KitaHQ screening** on REQ-2610-019 (generated candidates).
5. **Task closed (401)**: `/demo` → **Re-send callback** for any completed task. Or open the same open task in two tabs and send from both: the second shows "This step is already closed in Opus".

## Code map and where real Opus plugs in

```
src/domain/        schemas.ts (zod; types are inferred), types.ts, fixtures.ts (mock data, demo cast)
src/lib/api.ts     typed client used by every page (fetch + zod) – unchanged when the backend changes
src/server/
  store.ts         in-memory store on globalThis, optionally persisted to Upstash Redis (Vercel) → replace with a small DB (Azure SQL / Postgres)
  service.ts       app backend logic used by route handlers: role scoping, validation, completeTask()
  flows.ts         Flow 1 / Flow 1b behaviour (in the real build this runs in Opus; the app reads audit/results)
  precheck.ts      rule-based stand-in for the Opus AI pre-check
  pdf.ts           job post PDF (stand-in for the Opus Code "Job posting" step)
  opus/simulator.ts  Opus side: startJob, pauseOffPlatform (webhook), receiveCallback (401/404/422), getAudit
  opus/types.ts      Off-Platform payload / callback contracts
  app/webhook.ts     app side: receiveOffPlatformTask(payload) → Task record (routes by task_type + execution_id)
  app/callbackSender.ts  app side: sendCallback(task, body) → simulator (mock) or POST callback.url (opus)
src/app/api/...    route handlers
```

**Already connected:** submitting a requisition creates a real Opus case for the "Create Requisition" workflow (v1 Case API, initiate + execute) when `OPUS_SERVICE_KEY` and `OPUS_CREATE_REQUISITION_WORKFLOW_ID` are set. The case ID is kept server-side in `db.opus_cases` (in Redis on Vercel). If Opus can't be reached or rejects the request, the requisition is not submitted and the user sees a plain-language error. The simulator still drives the rest of the demo flow. See `specs/01-OpusIntegration-CreateRequisition.md`.

**Hiring Manager Review Round 1 (spec 02):** when the Opus run pauses at that Off-Platform node, Opus POSTs to `https://<app-domain>/api/opus/webhook?node=hm_review_r1` with header `X-Valiram-Webhook-Secret: <OPUS_WEBHOOK_SECRET>` (or `&secret=<OPUS_WEBHOOK_SECRET>` in the URL when the node can't send headers; on a protected preview also `&x-vercel-protection-bypass=<secret>`). The app finds the requisition by the `requisition_id` input (`workflow_input_1a4neujk0`), stores `execution_id` and the callback, creates a "Revise requisition" task for the hiring manager and sets the requisition to Returned to HM. On **Resubmit** it POSTs the 14 fields to `…/v1/execution/callback/{execution_id}` and, on 200, sets the requisition to With HR. Node input/output IDs live in `src/server/app/opusNodes.ts`. See `specs/02-OpusIntegration-HmReviewR1.md`.

**Round 1 · HR final check (spec 03):** same receiver at `?node=hr_review_r1`. The node sends one `json_string` input (`workflow_input_5x656gas6`) holding all fields and the `requisition_id`. The app creates a "Review requisition" task for HR (the requisition stays With HR). HR edits the fields and picks **Approve** or **Return** (message required). The callback sends the reviewed JSON (same keys and formats as received), `Pass Status` (`true` / `false`) and the HR Response Message. On 200, Approve generates the job posting and sets the requisition Live; Return sets Returned to HM, round 2 (the HM task comes with the next webhook). See `specs/03-OpusIntegration-HRReviewR1.md`.

To connect real Opus (`DATA_MODE=opus`):

1. **Opus client.** Implement `startJob` / status / audit / results against the Jobs or Case API with the `x-service-key` header (`OPUS_BASE_URL`, `OPUS_SERVICE_KEY`; keep it server-side only). Call it where `flows.ts` calls `startJob` for submit and for screening closed. Map `audit.running_node` to stage labels using Settings → Opus step mapping. The app records timestamps itself, because Opus audit has none.
2. **Off-Platform webhook receiver.** Implement `src/app/api/opus/webhook/route.ts`:
   - verify the shared header (`OPUS_WEBHOOK_SECRET`);
   - validate and store the full payload, because Opus never resends;
   - call `receiveOffPlatformTask()`;
   - return 200 within 15 s.
3. **Callback sender.** `src/server/app/callbackSender.ts` already sketches the real POST to `callback.url` with the token header. Handle 401 (show "task closed"), 404, and 422 (nothing stored; the run stays paused).
4. **Workflow logic.** Remove the simulator branches in `flows.ts` (pre-check, posting, score bands). Opus does those; the app only reacts to tasks, audit and the job-completed `callbackUrl`.
5. Add SSO instead of the role-switcher cookie, and a DB instead of `store.ts`.

## Known gaps (demo scope)

- No real Opus, KitaHQ, Gmail or Slack calls. Emails and Slack notifications only appear in the activity log.
- No persistence beyond the server process.
- Flows 2a/2b and the candidate portal are not built.
- "Watch KitaHQ interview" is a placeholder.
- Reminders are seeded data only; there is no timer.
- Only the three personas can be switched to. Tasks for other HMs (e.g. Nurul Aina) can't be acted on in the UI.
