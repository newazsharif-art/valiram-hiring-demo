# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Demo web app for the Valiram × Opus recruitment workflow (Flow 1 "Publish JD" and Flow 1b "Shortlist"). It runs against an **in-process mock backend plus an Opus simulator**, shaped so a real Opus integration can replace the simulator without UI changes. Behaviour source of truth: `../requirement_analysis/valiram-opus-recruitment-context.md` (v6, §4, §5, §9). The README has the full route/API tables, simulator rules and the demo script; read it before changing flow behaviour.

Stack: Next.js 15 App Router, React 19, TypeScript, MUI v6, zod, date-fns-tz, pdf-lib.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npm run build && npm start
```

There is no test suite. Verify changes with lint + typecheck and by driving the app (Presenter panel at `/demo` resets data and triggers simulator actions).

Env (`.env.example` → `.env.local`): `DATA_MODE` (`mock` only; `opus` not built), `SIM_DELAY_MS` (delay of simulated pre-check / posting, default 2500), `NEXT_PUBLIC_SHOW_SOURCES`.

## Architecture

Layering — keep it intact, since each layer maps to a part of the future real system:

- `src/domain/schemas.ts` — zod schemas are the single source of types; `types.ts` only does `z.infer`. `fixtures.ts` holds seed data, the demo cast, and `OUTPUT_SCHEMAS` (declared output fields per task type).
- `src/lib/api.ts` — typed fetch + zod client used by every page. Pages never call `fetch` directly. Should stay unchanged when the backend changes.
- `src/app/api/**/route.ts` — thin handlers: wrap in `handle()` from `src/server/http.ts` (maps `ApiError`/`ZodError` to JSON status codes), get the user via `currentUser()` (the `vh_user` cookie; no real auth), then call `src/server/service.ts`.
- `src/server/service.ts` — app backend logic: role scoping (HMs only see their own requisitions), validation, `completeTask()`. Always get the store via `db()`, not `rawDb()`: `db()` runs `tick()` first.
- `src/server/flows.ts` — workflow behaviour that in production runs **inside Opus** (pre-check, posting, score banding, round counting, round-3 rejection). The app side should only react to tasks/audit.
- `src/server/opus/simulator.ts` — the Opus side: jobs, `pauseOffPlatform()` (emits an Off-Platform webhook payload), `receiveCallback()` (enforces single-use token → 401, unknown → 404, undeclared field or wrapped `{value,type}` value → 422), `getAudit()` (no timestamps, like real Opus).
- `src/server/app/webhook.ts` / `callbackSender.ts` — the app side of the Off-Platform contract (`opus/types.ts`): turn a payload into a `TaskRecord`; send the callback (simulator in mock mode). Callback tokens stay server-side; `toPublicTask()` strips them.
- `src/server/store.ts` — in-memory DB on `globalThis` (shared across route bundles and hot reload); restart or `/demo` reset restores seed state.

**Simulated time:** there are no timers on the server. Async Opus steps are queued in `db.events` with a due time and executed by `tick()` at the start of the next API request. The UI polls (`useApi(..., { pollMs })` in `src/components/SessionProvider.tsx`) so pages advance on their own.

**Tasks** are routed by `task_type` (`HR_JD_CHECK`, `HM_JD_REVISE`, `SHORTLIST_REVIEW`); `/tasks/[id]` picks the component in `src/components/tasks/`. Task completion body is `{"output_data": {...bare values...}}` and must only use fields declared in `OUTPUT_SCHEMAS`.

**Stepper/stage display** is derived in `src/lib/steps.ts`; Opus node → stage label mapping is in Settings (`node_map`).

## Conventions

- All displayed times are MYT (`Asia/Kuala_Lumpur`); use helpers in `src/lib/format.ts`. Opus audit has no timestamps, so the app records its own.
- Requisition IDs are `REQ-YYMM-nnn`.
- Job posting PDF (`src/server/pdf.ts`) is LinkedIn-style layout but must not use LinkedIn's logo, name or colours.
- Seeded demo states the README demo script depends on (e.g. REQ-2611-001 with task T-0001 at 2/6/14, REQ-2611-003 at round 2) — don't break them when editing fixtures.
- Path alias `@/` → `src/`. Server modules import `"server-only"`.
