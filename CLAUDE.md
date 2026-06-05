# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **bun** (see `bun.lock`, `bunfig.toml`).

- `bun run dev` — Vite dev server (SSR via TanStack Start)
- `bun run build` — production build (Nitro, Cloudflare target by default)
- `bun run build:dev` — build in development mode
- `bun run preview` — preview built output
- `bun run lint` — ESLint over `.ts/.tsx`
- `bun run format` — Prettier write
- `npm run design:lint` — validate `DESIGN.md` against the `@google/design.md` spec (run after editing it; must stay 0 errors / 0 warnings)

No test runner is configured.

`bunfig.toml` enforces a 24h supply-chain guard (`minimumReleaseAge = 86400`). Before adding a package newer than 24h, confirm with the user and add it to `minimumReleaseAgeExcludes`.

## Architecture

**Stack:** TanStack Start (SSR React 19) + TanStack Router (file-based) + TanStack Query, Vite 7, Tailwind v4, shadcn/ui (New York style, `slate` base), Nitro build targeting Cloudflare Workers.

### Vite config is special

`vite.config.ts` wraps `@lovable.dev/vite-tanstack-config` — that preset **already includes** `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro`, the `@` path alias, React/TanStack dedupe, and dev-only plugins. **Do not re-add any of these** or the app breaks with duplicate-plugin errors. Extra config goes via `defineConfig({ vite: { ... } })`.

### SSR error funnel

Two layers wrap SSR so user-facing 500s render `renderErrorPage()` instead of raw stack traces:

1. `src/start.ts` — `errorMiddleware` on `createStart`, catches throws inside server handlers (rethrows `statusCode`-bearing errors so redirects/404s pass through).
2. `src/server.ts` — bundled server entry (`tanstackStart.server.entry = "server"` in `vite.config.ts`). Wraps the TanStack `fetch` handler and also detects h3's swallowed-error JSON (`{"unhandled":true,"message":"HTTPError"}`) via `normalizeCatastrophicSsrResponse`, since h3 turns in-handler throws into normal 500 JSON responses that `try/catch` never sees. Pulls the real error from `consumeLastCapturedError()` (registered by `src/lib/error-capture.ts`, imported for side effects at the top of `server.ts`).

Keep both layers when editing — they catch different failure modes.

### Routing

File-based via TanStack Router. `src/routes/README.md` documents conventions (these differ from Next/Remix):

- Dynamic: `users/$id.tsx` (bare `$`, no curly braces)
- Optional: `posts/{-$category}.tsx`
- Splat: `files/$.tsx` — read via `_splat`, never `*`
- Layout: `_layout.tsx` renders children via `<Outlet />`
- App shell: `src/routes/__root.tsx` — wraps every page, **must keep `<Outlet />`** or all child routes break. Holds `QueryClientProvider`, default `NotFoundComponent`/`ErrorComponent`, and head/meta.

`src/routeTree.gen.ts` is auto-generated — never edit by hand. `src/router.tsx` creates the router with `{ queryClient }` context.

### Server code & env access

Server logic lives in `createServerFn` handlers (see `src/lib/api/example.functions.ts`). Call from the client like `await getGreeting({ data: { name: "Ada" } })`. The `.handler` body is server-only and tree-shaken from the client bundle, but **module-level code in the same file still ships to the client** — for truly server-only helpers, use a `*.server.ts` file (e.g. `src/lib/config.server.ts`). Do NOT use Supabase Edge Functions for server logic — use `createServerFn`.

ESLint blocks importing `server-only` (Next convention); use `.server.ts` suffix or `@tanstack/react-start/server-only` instead.

Env-access patterns (documented in `src/lib/config.server.ts`):

- On Cloudflare Workers, env binds at **request time** — reading `process.env.X` at module scope returns `undefined`. Always read inside a function/handler.
- `.server.ts` module: server-only helpers, wrap reads in a function.
- Inline `process.env` inside a `createServerFn` handler: one-off server reads.
- `import.meta.env.VITE_*`: PUBLIC values shipped to the client. Never put secrets here.

### UI

shadcn/ui in `src/components/ui/` (aliases in `components.json`: `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`). Tailwind v4 with CSS variables, lucide-react icons. The current single feature is `src/components/FarmGame.tsx` — a self-contained Thai-themed Stardew-style farming game (mounted at `/` via `src/routes/index.tsx`) with pixel-art character (`PixelFarmer.tsx`). Tile/crop state is local React state; no persistence.

### Design system

`DESIGN.md` (repo root) is the design system in `@google/design.md` format: YAML token front matter (colors, typography, rounded, spacing, components) + prose rationale. It describes the cozy Thai-dusk pixel-art look — square corners, layered solid-shadow depth, no blur, `Press Start 2P` for chrome + `Mali` for prose. Tokens mirror `src/styles.css` `:root`, which is the source of truth — when they diverge, fix `DESIGN.md` to match the CSS, then re-run `npm run design:lint`.

**Before editing or adding ANY UI, read `DESIGN.md` first** and follow its tokens, components, and do's/don'ts. If a change introduces new tokens or components, update `DESIGN.md` to match and re-run `npm run design:lint` (keep 0 errors / 0 warnings).

## Skills Usage Policy

Goal: save tokens by loading skills only when needed. Don't preload all skills — invoke via the Skill tool when a trigger matches.

### Always load

- **karpathy-guidelines** — load on EVERY user prompt before doing work. Reduces common LLM coding mistakes (overcomplication, hidden assumptions, vague success criteria). Invoke at start of each turn regardless of task.

### Load on trigger (situational)

| Skill                           | Trigger                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `stop-slop`                     | Writing/editing prose, README, PR descriptions, commit messages, marketing copy |
| `full-output-enforcement`       | User asks for complete file, full code dump, no truncation, large generation    |
| `design-taste-frontend-v1`      | UI redesign, visual polish, component styling beyond shadcn defaults            |
| `industrial-brutalist-ui`       | User asks for brutalist/swiss/terminal aesthetic                                |
| `minimalist-ui`                 | User asks for clean/editorial/minimal aesthetic                                 |
| `high-end-visual-design`        | "Premium", "polished", "high-end" UI request                                    |
| `redesign-existing-projects`    | Audit + upgrade existing UI to premium quality                                  |
| `brandkit`                      | Creating brand assets, color/type system, logo guidance                         |
| `verify`                        | User asks: verify PR, confirm fix works, validate change in real app            |
| `run`                           | User asks: run/start app, take screenshot, see change live (FarmGame at `/`)    |
| `code-review` / `review`        | Reviewing diff or PR for bugs                                                   |
| `security-review`               | Security-focused review                                                         |
| `init`                          | Initializing/rewriting `CLAUDE.md` for a new repo                               |
| `update-config`                 | Permissions, hooks, env vars, `settings.json` changes                           |
| `keybindings-help`              | Customizing Claude Code keybindings                                             |
| `fewer-permission-prompts`      | User wants fewer permission prompts                                             |
| `loop` / `ScheduleWakeup`       | Recurring tasks, polling, "/loop" requests                                      |
| `claude-api`                    | Code imports `@anthropic-ai/sdk`, prompt caching, Claude model migrations       |
| `skill-creator` / `find-skills` | Create/edit/find skills, run skill evals                                        |
| `understand-anything:*`         | Deep architecture/domain analysis, knowledge graph, onboarding tour             |
| `glm-plan-usage:*`              | Query GLM Coding Plan usage                                                     |

### Phaser game-engine skills

Phaser 4 ships 28 official agent skills; they're symlinked into `.claude/skills/` from `node_modules/phaser/skills/` (resolve after `bun install`). Load the matching skill when touching Phaser code (`PhaserField.tsx`, `MultiplayerGame.tsx`, `src/lib/pixel-art.ts`) — pick by subsystem, don't preload all:

- `scenes`, `game-setup-and-config`, `loading-assets` — scene lifecycle, game config, asset loading
- `sprites-and-images`, `animations`, `text-and-bitmaptext`, `graphics-and-shapes` — game objects
- `input-keyboard-mouse-touch` — keyboard/mouse/touch input
- `physics-arcade`, `physics-matter` — physics engines
- `tweens`, `time-and-timers`, `particles`, `cameras` — motion, timing, FX
- `tilemaps`, `groups-and-containers`, `render-textures`, `filters-and-postfx` — maps, grouping, post-FX
- `scale-and-responsive`, `events-system`, `data-manager`, `geometry-and-math`, `curves-and-paths`, `audio-and-sound`, `actions-and-utilities`, `game-object-components` — supporting subsystems
- `v4-new-features`, `v3-to-v4-migration` — what's new in v4 / migrating v3 code

### Don't load

- Tailwind/shadcn/TanStack questions → use `context7` MCP instead (per MCP instructions)
- Project structure / convention questions → already in this file
- Trivial edits, typo fixes, single-file tweaks → skip skills, just do it
