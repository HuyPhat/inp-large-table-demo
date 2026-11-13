# Plan: reproduce the high-frequency SSE update problem

Status: **in progress**. A1 to A6 and B1 are done and verified. Next: B2 (the `naive` variant).

English version of [PLAN-sse-streaming.md](PLAN-sse-streaming.md). If the two ever differ, treat the Vietnamese file as the original.

## Goal

The purpose is **learning**: how `requestAnimationFrame` and batching work, and how `setTimeout` compares with `requestAnimationFrame`. It is not a portfolio demo, and it does not have to match any real application.

Reproduce an "update storm": the server pushes about 1,000 messages per second over SSE to update a table, and each message triggers its own render. Three symptoms to reproduce and measure:

1. Poor INP, because user interactions queue behind message tasks and renders.
2. Display latency that grows over time relative to the server.
3. Growing memory.

Hypothesis for the mechanism: the update rate (1,000/s) far exceeds the display rate (about 60/s), but every message arrives in its own task, so React cannot reliably batch them. That could mean up to 1,000 renders per second while only about 60 are ever painted. This hypothesis is tested in step B2.

## Decisions already made

- All three symptoms must be reproduced (INP, latency, memory).
- The filter box stays active while the stream runs. No sorting.
- Each message is a one-row patch: `id`, a few changed fields (for example `status`, `qty`, `total`, `updatedAt`), plus `seq` and `sentAt`. Patches apply to the 1,000 loaded rows, with ids chosen uniformly at random from a seed.
- No reconnect, no multiple clients.
- The second application lives in the same monorepo and **shares no code with `apps/web` or `apps/api`**.
- Monorepo tool: **Turborepo only** (no Nx), on top of the existing pnpm workspace.
- Frontend: **Vite + React**. API: a **separate NestJS app** inside the new app's folder.

## Monorepo layout

```text
apps/web          unchanged (port 3000)
apps/api          unchanged (port 3001)
apps/stream-web   NEW: Vite + React, port 5173
apps/stream-api   NEW: NestJS, SSE endpoint, port 3002
turbo.json        NEW
```

- `pnpm-workspace.yaml` already contains `apps/*`, so both new apps are picked up with no change.
- No shared package. `COLUMNS`, the formatters and the INP meter are **copied** into `stream-web` (about 100 duplicated lines), as required by the isolation. The `window.__interactions` contract is kept identical so similar measurement scripts work.
- `stream-api` copies the NestJS config (`nest-cli.json`, `tsconfig.json`, `package.json`) from `apps/api` with the same dependency versions, to change the lockfile as little as possible.
- Fixed ports: `stream-web` 5173 (`strictPort`, both dev and preview), `stream-api` 3002 with CORS limited to `http://localhost:5173`. This avoids clashing with ports 3000 and 3001 of the original demo.
- `turbo.json` has three tasks: `build` (depends on `^build`; outputs `.next/**` excluding `.next/cache/**`, and `dist/**`), `dev` (no cache, persistent), and `start` (depends on `build`, no cache, persistent).
- Root scripts switch to `turbo run build|dev|start`. New scripts: `dev:stream` (`turbo run dev --filter=stream-web --filter=stream-api`) so you don't have to start all four servers, and `measure:stream`. The original `measure` script stays as is.

To check during implementation (not yet verified):
- Turborepo usually requires a `packageManager` field in the root `package.json`, which is missing today. I will add it based on `pnpm -v`.
- The key name in `turbo.json` (`tasks` or `pipeline`) depends on the installed Turborepo version. I will check it against the real version.
- After the switch, `pnpm start` will build first (because `start` depends on `build`), which differs from the current CLAUDE.md. The docs must be updated.

## What to borrow from the current project (copy, don't import)

- The deterministic data, `COLUMNS`, the formatters and the INP meter (`InpMeter` in `apps/web/app/shared.tsx`).
- `scripts/measure.mjs` as the template for `scripts/measure-stream.mjs` (Playwright, Event Timing, CPU throttling).

What cannot be reused as is, and why the new design differs:
- `useRows` keeps data in a `useState` array, so every message would copy a 1,000-element array.
- The `/fixed` page would break under streaming: `searchable` depends on `table.items`, so it re-runs `JSON.stringify` for all 1,000 rows every time the array changes.
- `measure.mjs` currently measures only while the page is idle.

## Design

**Server (`stream-api`).** `GET /stream?rate=N&seed=S`. Use a seeded PRNG so the same seed gives the same message sequence. Emit in batches every 10 ms (about `N/100` messages per batch) instead of one timer per message. The `@Sse()` API on Nest 12 is not yet verified, and step B1 will check it.

**Client (`stream-web`).** A single page that picks its variant from the query string (no router needed). An external store holds a `Map<id, Row>`. Rows subscribe by id through `useSyncExternalStore`, so only rows that are visible and changed re-render. Messages for rows outside the viewport only write to the store.

**Filtering while streaming.** A patch can move a row into or out of the filter result. In the fixed variant, each flush rebuilds the search string only for rows that changed, then re-filters the `visible` list (1,000 `includes` calls). In the naive variant, keep the old behavior: `JSON.stringify` the whole table on every render.

**Axes of change** (independent of each other, so each can be measured on its own):

| Axis | Options |
| --- | --- |
| Scheduling | one render per message (baseline) / `setTimeout` every N ms / `requestAnimationFrame` |
| Buffer | list (no coalescing) / `Map` by id (coalescing, bounded size) |
| Rendering | array state, re-render the whole table (markup like `/broken`) / per-row subscription, virtualized |

Selected through the query, for example `/?mode=naive`, `/?mode=raf&buffer=map`, `/?mode=timeout&ms=100&buffer=list`. The `flush` function and the store are shared, and only the scheduling line and the buffer type differ. No extra abstraction layers.

## rAF vs setTimeout (hypotheses to measure)

- `setTimeout` with a large N (100 ms) may cost less CPU because there are fewer commits, but the data is staler and each batch is larger, so a single task can be longer.
- `setTimeout` with N around 16 ms has about the same frequency as rAF but is not aligned to frames. This comparison shows the value of syncing with painting.
- Background tabs: rAF is paused, while `setTimeout` is throttled to about once per second.
- For INP, I cannot yet predict which one wins.

## Memory: how to reproduce it

I don't know yet whether the naive version really grows memory, so the plan is to measure first and conclude after. There are three possible sources:

1. **Backlog:** when the main thread can't keep up, SSE data and message tasks pile up.
2. **Garbage from copying arrays and creating objects for every message.** This is GC churn (a sawtooth graph), not a leak.
3. **A list buffer in a background tab:** rAF is paused but messages keep arriving, so the list grows without bound. This is the classic trap and the reason `buffer=map` exists.

Method: run for 60 seconds, sample `JSHeapUsedSize` through CDP `Performance.getMetrics`, and call `HeapProfiler.collectGarbage` before each sample to separate a leak from churn. If the naive version does not actually grow memory, report exactly that, and note that only `buffer=list` in a background tab grows.

## Metrics

- INP, from `window.__interactions`, including typing in the filter box while the stream runs.
- Total long-task time and FPS (measured as the gap between `requestAnimationFrame` callbacks).
- Renders per second.
- Messages applied per second versus messages the server sent (detects main-thread starvation).
- Display latency p50 and p95, from `sentAt` until painted, and its trend over time (growing or stable).
- Total main-thread busy time, through CDP `Performance.getMetrics`.
- Memory over time, as described above.

## Steps

### Part A: build the monorepo and the two new apps

- **A1. Add Turborepo.** Install `turbo` at the root, add `packageManager`, create `turbo.json`, switch the root scripts. Check: `pnpm build` builds `web` and `api` as before, and the second run reports a cache hit.
- **A2. Scaffold `stream-api`.** One temporary endpoint that returns 200. Check: `pnpm --filter stream-api build && start`, then `curl` port 3002.
- **A3. Scaffold `stream-web`.** Vite + React, an empty page showing "0 rows" and the copied INP meter. Check: `pnpm --filter stream-web build` succeeds and the page opens on port 5173.
- **A4. Run everything together.** Check: `pnpm dev:stream` starts the two new apps and `pnpm dev` starts all four with no port clash.
- **A5. The original demo is unaffected.** Check: `pnpm start` then `pnpm measure` still gives numbers close to the README table (about 168 ms for a `/broken` click at 1x CPU), and nothing changed in `apps/web` or `apps/api`.

### Part B: reproduce the streaming problem

- **B1. Server-side SSE.** Check: `curl -N` counting lines over 5 seconds matches `rate`, and the same seed gives the same sequence.
- **B2. The `mode=naive` variant.** Check: at 1,000 msg/s the INP meter goes red and the number of renders is close to the number of messages. If not, the mechanism hypothesis is wrong and must be revisited.
- **B3. `measure-stream.mjs`.** Check: at rate=0 the naive variant gives numbers close to `/broken` (same markup), confirming the harness does not distort results. Output is one JSON line per configuration, like `measure.mjs`.
- **B4. The `mode=raf` and `mode=timeout` variants**, both with `buffer=map`. Check: the same harness shows better results than the naive version.
- **B5. Correctness check.** After the stream stops, the table state and the filter result must equal the expected state computed from the seed. Coalescing must not lose data.
- **B6. Isolate each axis.** Turn on one change at a time (scheduling, buffer, rendering) and measure each alone, because last time we could not separate the contribution of each fix.
- **B7. Memory and background tab.** Run the 60-second measurement for each variant, plus a case where you switch tabs while the stream runs, comparing `buffer=list` with `buffer=map`.
- **B8. Write up.** Update the README and CLAUDE.md: the new structure, the new commands (`dev:stream`, `measure:stream`), the new port constraints, the fact that `start` now builds first, and a few lines recording what was learned about rAF and `setTimeout`.

## Measurement matrix

Rates: 0, 100, 500, 1,000, 2,000, 5,000 msg/s. CPU: 1x and 4x. For `setTimeout`, try N = 16, 50, 100, 250. For each variant, find the "breaking point": the first rate where INP exceeds 200 ms or the number of messages applied per second drops below the number the server sends. Do not pick a fixed rate in advance.

From about 5,000 msg/s upward, the Node server or the message size may become the bottleneck and skew the measurement. If `curl -N` in step B1 shows the server cannot reach the requested rate, do not measure at that level.

## Out of scope

Nx, shared packages between apps, sorting, reconnect with `Last-Event-ID`, multiple clients, WebSocket, authentication.
