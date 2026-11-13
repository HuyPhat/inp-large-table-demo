# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm workspace (`apps/*`) that demonstrates how large-table rendering affects INP. `apps/web` (Next.js App Router) serves two pages over the same data from `apps/api` (a NestJS app in a single file). `/broken` is the slow version and `/fixed` is the optimized one.

A second, independent experiment lives in `apps/stream-web` (Vite + React) and `apps/stream-api` (NestJS): high-frequency SSE updates to a table. It shares no code with `apps/web` or `apps/api` on purpose, so some code (columns, formatters, INP meter) is duplicated. See `PLAN-sse-streaming.en.md` for the plan and what is still to build. Turborepo (`turbo.json`) orchestrates all four apps.

**`/broken` is slow on purpose.** Do not optimize it, and do not share optimizations into it. The value of the demo is the difference between the two pages, so a change to one usually needs a deliberate decision about the other.

## Commands

```bash
pnpm install
pnpm dev                    # all four apps, with watch (turbo run dev)
pnpm dev:stream             # only stream-web (:5173) and stream-api (:3002)
pnpm build                  # build all apps (turbo caches outputs)
pnpm start                  # build if needed, then serve all four production builds
pnpm --filter web dev       # run one app (web, api, stream-web, stream-api); also works with build and start

pnpm exec playwright install chromium   # first time only
pnpm measure                # needs `pnpm start` running in another terminal
```

There is no test suite and no linter. `pnpm measure` is the verification step for rendering changes. It takes roughly a minute and prints one JSON line per page and CPU throttle level (1x and 4x).

`pnpm start` builds first (turbo `start` depends on `build`, and unchanged apps are replayed from cache), so it always serves current source. Do not measure against `pnpm dev`, because React's development build distorts the numbers. If a measurement looks stale, run `pnpm turbo run build --force`.

## Architecture

The two pages share everything in `apps/web/app/shared.tsx` (`COLUMNS`, `useRows`, `Toolbar`, the INP meter) and differ only in rendering:

| Concern | `/broken` | `/fixed` |
| --- | --- | --- |
| DOM | `<table>` with every row of the page | ARIA-role `div`s, virtualized with `@tanstack/react-virtual` |
| Re-rendering | every row on any state change | `memo` row with a stable `onSelect` |
| Formatting | `formatPerCell`, new `Intl` object per cell | `formatCached`, formatters built once |
| Filtering | `JSON.stringify` per row on every render | search strings precomputed with `useMemo` |
| Layout | auto table layout measures every cell | fixed-size CSS grid (`.grid-row`) |

`formatPerCell` and `formatCached` must produce identical output, so that the pages differ only in cost.

The API generates 20,000 rows deterministically at startup, so measurements are comparable between runs. Keep generation deterministic (no `Math.random` or current time). Filtering happens client-side and covers only the loaded page.

## Couplings that are easy to break

- `scripts/measure.mjs` depends on `#filter`, `button.row-select`, `[data-ready]` and `window.__interactions`. Both pages must keep them.
- `ROW_HEIGHT` in `apps/web/app/fixed/page.tsx` must match the `.grid-row` height in `globals.css`. The virtualizer's `scrollMargin` and each row's `top` offset also use it to account for the sticky header.
- Ports are hard-coded in several places: the fetch URL in `useRows`, the CORS origin and `listen` call in `apps/api/src/main.ts`, `BASE` in `scripts/measure.mjs`, and the `-p` flags in `apps/web/package.json`. The stream apps use 5173 (`strictPort` in `apps/stream-web/vite.config.ts`) and 3002 (`apps/stream-api/src/main.ts`, whose CORS origin must match 5173), so they never clash with 3000 and 3001.
- Turbo hashes every non-ignored file in a package, so build or log output must stay in `.gitignore` (`.turbo`, `dist`, `.next`). Otherwise the cache never hits.
- Row fields come from `apps/api/src/main.ts` and `COLUMNS` in `shared.tsx` refers to them by key, with no shared type between the apps.
- The results table in `README.md` is a manual copy of `pnpm measure` output. Re-measure and update it when a change affects rendering.
