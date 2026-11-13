# Plan: Turborepo setup and the second app (`stream-web` + `stream-api`)

Status: **awaiting review**. No code has been written.

This is the scaffolding half of the SSE work. The experiment itself (SSE protocol, rAF vs `setTimeout` batching, metrics) lives in [PLAN-sse-streaming.md](PLAN-sse-streaming.md), Part B. This plan only produces the empty, runnable apps that Part B fills in.

## Goal

Add a second application to this repo for the high-frequency SSE experiment, using a monorepo tool, without touching or sharing code with the existing demo (`apps/web`, `apps/api`).

Done means:

- Two new apps build, start and run side by side with the existing two, with no port clashes.
- The existing demo still behaves and measures exactly as before.
- One command runs each group of apps, and builds are cached.

## Decisions (already made)

| Question | Decision |
| --- | --- |
| Monorepo tool | Turborepo only. No Nx: both do the same job (task orchestration and caching), so using both adds config without adding capability. |
| Frontend | Vite + React. No SSR and no Next.js dev/prod split, so the experiment measures client-side rendering only. |
| SSE endpoint | A separate small NestJS app, not a new route in `apps/api`. The first demo's API, ports, CORS and recorded numbers stay untouched. |
| Code sharing | None. `COLUMNS`, formatters and the INP meter are copied into the new app (about 100 duplicated lines). That is the accepted cost of isolation. |

## Target layout

```text
apps/web          unchanged, port 3000
apps/api          unchanged, port 3001
apps/stream-web   NEW: Vite + React, port 5173
apps/stream-api   NEW: NestJS with the SSE endpoint, port 3002
turbo.json        NEW
```

`pnpm-workspace.yaml` already contains `apps/*`, so it needs no change.

## Design

**Turborepo.** Add `turbo` as a root dev dependency and a root `turbo.json` with three tasks:

- `build`: depends on `^build`; outputs `.next/**` (excluding `.next/cache/**`) and `dist/**`.
- `dev`: no cache, persistent.
- `start`: depends on `build`; no cache, persistent.

Root scripts change to `turbo run build|dev|start`. New scripts: `dev:stream` (`turbo run dev --filter=stream-web --filter=stream-api`) so you don't have to start all four servers, and `measure:stream`. The existing `measure` script stays as is.

**`stream-api`.** Copy `nest-cli.json`, `tsconfig.json` and `package.json` from `apps/api` with identical dependency versions, so the lockfile changes as little as possible. Start with one placeholder endpoint. The real SSE endpoint is Part B, step B1. Port 3002, CORS allowed only for `http://localhost:5173`.

**`stream-web`.** Hand-written minimal Vite + React + TypeScript (no interactive generator): `package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`. Use the same React and TypeScript versions as `apps/web`. Port 5173 for both `dev` and `preview` with `strictPort`, so a clash fails loudly. `start` runs `vite preview`, because the experiment must be measured on a production build. The page initially shows "0 rows" and the copied INP meter, keeping the `window.__interactions` contract that the measurement scripts rely on.

## Steps

Each step has a check that fails if the step is wrong.

1. **A1. Add Turborepo.** Install `turbo`, add the `packageManager` field, create `turbo.json`, switch the root scripts.
   Check: `pnpm build` builds `web` and `api` as before, and a second run reports a cache hit.
2. **A2. Scaffold `stream-api`.**
   Check: build and start it, then `curl` port 3002 returns 200.
3. **A3. Scaffold `stream-web`.**
   Check: `pnpm --filter stream-web build` succeeds and the page opens on port 5173 showing "0 rows".
4. **A4. Run everything together.**
   Check: `pnpm dev:stream` starts the two new apps, and `pnpm dev` starts all four with no port clashes.
5. **A5. Confirm the original demo is unaffected.**
   Check: `pnpm start` then `pnpm measure` gives numbers close to the README table (about 168 ms median click on `/broken` at 1x CPU), and `git diff` shows no changes under `apps/web` or `apps/api`.
6. **A6. Update the docs.** Add the new apps, commands and ports to CLAUDE.md and the README. Note that `pnpm start` now builds first.

## Risks and unverified assumptions

These are things I have not confirmed, to be checked while doing the steps:

- Turborepo typically requires a `packageManager` field in the root `package.json`, which this repo does not have yet. I will take the value from `pnpm -v`.
- The key name in `turbo.json` (`tasks` or the older `pipeline`) depends on the installed Turborepo version. I will check against the version that gets installed.
- Once `start` depends on `build`, `pnpm start` will rebuild first. CLAUDE.md currently says the opposite ("serves the last build"), so it must be updated, or the dependency dropped if you prefer the old behavior.
- Turborepo's build cache can mask a stale build during measurements. If a measurement looks wrong, rebuild with `--force` before trusting it.
- Duplicated code (`COLUMNS`, formatters, INP meter) can drift from `apps/web`. That is acceptable for a learning experiment, but the copies should not be assumed identical later.

## Out of scope

Nx, a shared package between apps, linting, tests, CI, deployment, and everything in Part B (the SSE endpoint, the batching variants and the measurements).

## Hand-off to Part B

After A6, `stream-web` shows an empty table and `stream-api` answers on port 3002. Part B starts at B1: the real SSE endpoint with `rate` and `seed` parameters.
