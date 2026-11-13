# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm workspace (`apps/*`) that demonstrates how large-table rendering affects INP. `apps/web` (Next.js App Router) serves two pages over the same data from `apps/api` (a NestJS app in a single file). `/broken` is the slow version and `/fixed` is the optimized one.

**`/broken` is slow on purpose.** Do not optimize it, and do not share optimizations into it. The value of the demo is the difference between the two pages, so a change to one usually needs a deliberate decision about the other.

## Commands

```bash
pnpm install
pnpm dev                    # web on :3000 and api on :3001, with watch
pnpm build                  # build both apps
pnpm start                  # serve the production builds of both apps
pnpm --filter web dev       # run one app (web or api); also works with build and start

pnpm exec playwright install chromium   # first time only
pnpm measure                # needs `pnpm start` running in another terminal
```

There is no test suite and no linter. `pnpm measure` is the verification step for rendering changes. It takes roughly a minute and prints one JSON line per page and CPU throttle level (1x and 4x).

`pnpm start` serves the last build, so run `pnpm build` after changing source and before measuring. Do not measure against `pnpm dev`, because React's development build distorts the numbers.

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
- Ports are hard-coded in several places: the fetch URL in `useRows`, the CORS origin and `listen` call in `apps/api/src/main.ts`, `BASE` in `scripts/measure.mjs`, and the `-p` flags in `apps/web/package.json`.
- Row fields come from `apps/api/src/main.ts` and `COLUMNS` in `shared.tsx` refers to them by key, with no shared type between the apps.
- The results table in `README.md` is a manual copy of `pnpm measure` output. Re-measure and update it when a change affects rendering.
