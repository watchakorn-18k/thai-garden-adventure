# 🌾 Thai Garden Adventure

เกมปลูกผักสไตล์ไทย ธีม Stardew Valley — pixel art, SSR React 19, deploy บน Cloudflare Workers.

![Stack](https://img.shields.io/badge/React-19-61dafb) ![Vite](https://img.shields.io/badge/Vite-7-646cff) ![TanStack](https://img.shields.io/badge/TanStack-Start-ff4154) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8) ![Bun](https://img.shields.io/badge/Bun-package%20manager-f9f1e1)

## ฟีเจอร์
- 🌱 ระบบปลูกผักไทย (ผักบุ้ง, พริก, มะเขือ ฯลฯ) บน grid
- 👨‍🌾 ตัวละคร pixel art เคลื่อนไหวได้
- ⛏️ FX ขุด/ปลูก/เก็บเกี่ยว
- ⚔️ **1v1 Esport mode** — แข่งแรกถึง 500 เหรียญ บน Cloudflare Durable Object
- 🎨 UI shadcn/ui + Tailwind v4
- ⚡ SSR + Cloudflare Workers

## โหมด 1v1

```bash
# terminal 1: match server (Cloudflare Worker + Durable Object)
bun run dev:match

# terminal 2: main app
bun run dev
```

เปิด http://localhost:5173/lobby → สร้างห้อง → แชร์รหัส 6 ตัวให้คู่แข่ง → กด READY ทั้งคู่ → เริ่มแข่ง.

Production มี 2 ทาง:

- Cloudflare: deploy `bun run deploy:match` แล้วตั้ง `VITE_MATCH_WS_URL=wss://thai-garden-match.<sub>.workers.dev` ตอน build main app.
- VPS/Podman: รัน web image + match image แยกกัน ดูหัวข้อ Docker deploy.

## Docker deploy บน VPS

GitHub Actions build/push 2 images:

- `ghcr.io/watchakorn-18k/thai-garden-adventure:latest` — web app, container port `3000`
- `ghcr.io/watchakorn-18k/thai-garden-match:latest` — match WebSocket worker, container port `8787`

ตั้ง GitHub Actions variable ก่อน build web image:

```text
VITE_MATCH_WS_URL=ws://localhost:8787
```

ถ้าเว็บอยู่หลัง HTTPS ให้ใช้ `wss://...` แทน `ws://...`.

รันบน VPS:

```bash
podman pull ghcr.io/watchakorn-18k/thai-garden-adventure:latest
podman pull ghcr.io/watchakorn-18k/thai-garden-match:latest

podman rm -f thai-garden-match 2>/dev/null
podman run -d \
  --name thai-garden-match \
  --restart=always \
  --memory=512m \
  -p 8787:8787 \
  ghcr.io/watchakorn-18k/thai-garden-match:latest

podman rm -f thai-garden-adventure 2>/dev/null
podman run -d \
  --name thai-garden-adventure \
  --restart=always \
  --memory=256m \
  -p 8080:3000 \
  ghcr.io/watchakorn-18k/thai-garden-adventure:latest
```

เปิด firewall:

```bash
sudo ufw allow 8080/tcp
sudo ufw allow 8787/tcp
sudo ufw reload
```

เช็ค worker:

```bash
curl http://127.0.0.1:8787/health
curl http://localhost:8787/health
podman logs --tail=100 thai-garden-match
```

เปิดเว็บ:

```text
http://localhost:8080
```

## เริ่มต้น

ต้องมี [Bun](https://bun.sh) ติดตั้งก่อน.

```bash
bun install
bun run dev
```

เปิด http://localhost:5173

## Scripts

| Command                | ใช้ทำอะไร                                    |
| ---------------------- | -------------------------------------------- |
| `bun run dev`          | Vite dev server (SSR)                        |
| `bun run build`        | production build → Cloudflare Workers        |
| `bun run build:dev`    | build แบบ dev mode                           |
| `bun run preview`      | preview ของ built output                     |
| `bun run lint`         | ESLint `.ts/.tsx`                            |
| `bun run format`       | Prettier write                               |
| `bun run dev:match`    | Cloudflare Worker (match server) ที่ `:8787` |
| `bun run deploy:match` | deploy match worker                          |

## Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (SSR React 19)
- **Router:** [TanStack Router](https://tanstack.com/router) (file-based)
- **Data:** [TanStack Query](https://tanstack.com/query)
- **Build:** Vite 7 + Nitro → Cloudflare Workers
- **UI:** Tailwind v4 + [shadcn/ui](https://ui.shadcn.com) (New York, slate)
- **Icons:** lucide-react
- **Forms:** react-hook-form + zod
- **Package manager:** bun

## โครงสร้าง

```
src/
├── routes/              # file-based routing (TanStack)
│   ├── __root.tsx       # app shell — มี <Outlet />, QueryClientProvider
│   ├── index.tsx        # mount FarmGame ที่ /
│   └── README.md        # convention ของ TanStack Router
├── components/
│   ├── FarmGame.tsx     # core game loop
│   ├── PixelFarmer.tsx  # ตัวละคร pixel
│   ├── PixelCrop.tsx    # crop sprite
│   └── ui/              # shadcn/ui primitives
├── lib/
│   ├── api/             # createServerFn handlers
│   ├── config.server.ts # env access (server-only)
│   └── error-capture.ts # SSR error funnel
├── hooks/
├── start.ts             # createStart + errorMiddleware
├── server.ts            # bundled server entry
└── router.tsx           # router + queryClient context
```

## ข้อควรรู้

### Vite config

`vite.config.ts` wrap `@lovable.dev/vite-tanstack-config` ซึ่ง include `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro`, `@` alias อยู่แล้ว. **อย่าใส่ซ้ำ** — pluging ชนกันแอปพัง.

### SSR error layers

มี 2 ชั้น (อย่าลบทั้งคู่):

1. `src/start.ts` — `errorMiddleware` จับ throw ใน server handler
2. `src/server.ts` — wrap fetch handler, จับ h3 swallowed error ด้วย `normalizeCatastrophicSsrResponse`

### Env บน Cloudflare Workers

Cloudflare bind env ตอน **request time**. `process.env.X` ที่ module scope = `undefined`. อ่านใน function/handler เสมอ.

- Secrets → `.server.ts` หรือ inline ใน `createServerFn` handler
- Public values → `import.meta.env.VITE_*` (ส่ง client)

### Routing (ไม่เหมือน Next/Remix)

- Dynamic: `users/$id.tsx`
- Splat: `files/$.tsx` → read via `_splat` ไม่ใช่ `*`
- Layout: `_layout.tsx` ต้องมี `<Outlet />`
- `routeTree.gen.ts` auto-gen — **ห้ามแก้มือ**

### Supply-chain guard

`bunfig.toml` block package ที่อายุน้อยกว่า 24 ชม. ถ้าจะใช้ใหม่มากต้องเพิ่มใน `minimumReleaseAgeExcludes`.

## เอกสารเพิ่ม

- [`CLAUDE.md`](./CLAUDE.md) — guide สำหรับ Claude Code
- [`AGENTS.md`](./AGENTS.md) — guide สำหรับ AI agents ทั่วไป
- [`src/routes/README.md`](./src/routes/README.md) — convention ของ routing

## License

Private project.
