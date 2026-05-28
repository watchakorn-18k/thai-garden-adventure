# AGENTS.md

Guide for AI agents (Claude Code, Cursor, Codex, etc.) working in this repo. Mirror of CLAUDE.md for tool-agnostic agents.

## Project

Thai Garden Adventure — Thai-themed Stardew-style farming game. Single-page TanStack Start app, pixel-art UI.

## Stack

- TanStack Start (SSR React 19) + TanStack Router (file-based) + TanStack Query
- Vite 7, Tailwind v4, shadcn/ui (New York, slate base)
- Nitro build → Cloudflare Workers
- Package manager: **bun**

## Commands

- `bun run dev` — Vite dev server (SSR)
- `bun run build` — prod build (Cloudflare target)
- `bun run build:dev` — dev-mode build
- `bun run preview` — preview built output
- `bun run lint` — ESLint over `.ts/.tsx`
- `bun run format` — Prettier write

No test runner configured.

## Supply-chain guard

`bunfig.toml` enforces `minimumReleaseAge = 86400` (24h). Confirm with user before adding packages newer than 24h; add to `minimumReleaseAgeExcludes` if approved.

## Vite config rules

`vite.config.ts` wraps `@lovable.dev/vite-tanstack-config`. Preset **already includes**: `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro`, `@` alias, React/TanStack dedupe, dev plugins. **Do NOT re-add** — causes duplicate-plugin errors. Extra config via `defineConfig({ vite: { ... } })`.

## SSR error handling

Two layers — keep both:

1. `src/start.ts` — `errorMiddleware` on `createStart`. Catches throws in server handlers, rethrows `statusCode` errors for redirects/404s.
2. `src/server.ts` — bundled entry (`tanstackStart.server.entry = "server"`). Wraps fetch handler. Detects h3-swallowed errors via `normalizeCatastrophicSsrResponse`. Pulls real error via `consumeLastCapturedError()` from `src/lib/error-capture.ts` (side-effect import at top of `server.ts`).

## Routing (TanStack — differs from Next/Remix)

- Dynamic: `users/$id.tsx` (bare `$`)
- Optional: `posts/{-$category}.tsx`
- Splat: `files/$.tsx` → read via `_splat`, never `*`
- Layout: `_layout.tsx` renders `<Outlet />`
- Root: `src/routes/__root.tsx` — **must keep `<Outlet />`**, holds `QueryClientProvider`, default NotFound/Error components, head/meta
- `src/routeTree.gen.ts` — auto-generated, never edit
- `src/router.tsx` — creates router with `{ queryClient }` context

## Server code & env

Server logic → `createServerFn` handlers (see `src/lib/api/example.functions.ts`). Call client-side: `await getGreeting({ data: { name: "Ada" } })`.

`.handler` body is server-only/tree-shaken. **Module-level code in same file still ships to client** — use `*.server.ts` for true server-only helpers (e.g. `src/lib/config.server.ts`).

Do NOT use Supabase Edge Functions — use `createServerFn`.

ESLint blocks `server-only` (Next convention). Use `.server.ts` suffix or `@tanstack/react-start/server-only`.

Env access:

- Cloudflare Workers bind env at **request time** — `process.env.X` at module scope returns `undefined`. Read inside function/handler.
- `.server.ts`: server-only helpers, wrap reads in function
- `createServerFn` handler: inline `process.env` reads OK
- `import.meta.env.VITE_*`: PUBLIC, ships to client. Never put secrets here.

## UI

- shadcn/ui in `src/components/ui/`
- Aliases (`components.json`): `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`
- Tailwind v4 + CSS variables, lucide-react icons
- Main feature: `src/components/FarmGame.tsx` (mounted at `/` via `src/routes/index.tsx`)
- Pixel character: `src/components/PixelFarmer.tsx`
- Tile/crop state: local React state, no persistence

## Conventions for agents

- Edit existing files over creating new ones
- No comments unless WHY is non-obvious
- No backwards-compat shims, no `_unused` rename hacks
- No speculative abstractions — three similar lines beat premature abstraction
- Trust internal/framework guarantees; validate only at system boundaries
- For UI changes: start dev server, test in browser before reporting done
- Library docs (Tailwind/shadcn/TanStack/React): use `context7` MCP, not web search
- Don't edit `src/routeTree.gen.ts`, `bun.lock`

## Risky actions — confirm first

- `git push`, force-push, `git reset --hard`, deleting branches/files
- Dropping deps, modifying CI, removing config
- Uploading code to third-party tools
