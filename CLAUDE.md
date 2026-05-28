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
