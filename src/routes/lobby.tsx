import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { makeRoomCode, ROOM_CODE_RE } from "@/lib/match-protocol";

export const Route = createFileRoute("/lobby")({
  head: () => ({
    meta: [{ title: "1v1 Lobby — สวนผักไทย" }],
  }),
  component: LobbyPage,
});

function LobbyPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("tg.name") ?? "") : "",
  );
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveName = (n: string) => {
    setName(n);
    if (typeof window !== "undefined") localStorage.setItem("tg.name", n);
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อก่อน");
    const code = makeRoomCode();
    navigate({ to: "/match/$code", params: { code } });
  };

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อก่อน");
    const code = joinCode.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) return setError("รหัสห้องไม่ถูกต้อง (6 ตัว A-Z 2-9)");
    navigate({ to: "/match/$code", params: { code } });
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
      <div className="sky-stars" />

      <header className="relative z-10 flex flex-col items-center gap-2">
        <h1
          className="font-pixel text-[28px] text-[var(--gold)]"
          style={{ textShadow: "3px 3px 0 #1a0f1f, 0 0 24px rgba(255,210,74,0.4)" }}
        >
          1v1 ESPORT MODE
        </h1>
        <p className="font-pixel text-[9px] text-[var(--muted-foreground)]">
          แข่งแรกถึง 500 เหรียญ ชนะ — เวลาจำกัด 5 นาที
        </p>
      </header>

      <div className="relative z-10 pixel-panel p-6 flex flex-col gap-5 min-w-[360px]">
        <label className="flex flex-col gap-2">
          <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">PLAYER NAME</span>
          <input
            value={name}
            onChange={(e) => saveName(e.target.value.slice(0, 16))}
            placeholder="พิมพ์ชื่อ"
            className="pixel-chip font-pixel text-[12px] px-3 py-2 outline-none"
            style={{ minWidth: 200 }}
          />
        </label>

        <button
          onClick={create}
          className="pixel-btn flex items-center justify-center gap-2"
          data-accent="true"
        >
          <span className="font-pixel text-[12px]">CREATE ROOM</span>
        </button>

        <div className="flex items-center gap-2 my-1">
          <div className="flex-1 h-[2px] bg-[#1a0f1f]" />
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">OR</span>
          <div className="flex-1 h-[2px] bg-[#1a0f1f]" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">ROOM CODE</span>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="ABCD23"
              className="pixel-chip font-pixel text-[14px] tracking-[4px] px-3 py-2 outline-none flex-1 text-center"
            />
            <button onClick={join} className="pixel-btn">
              <span className="font-pixel text-[12px]">JOIN</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="font-pixel text-[9px]" style={{ color: "#ff6b6b" }}>
            {error}
          </div>
        )}
      </div>

      <a
        href="/"
        className="relative z-10 font-pixel text-[9px] text-[var(--muted-foreground)] opacity-70 hover:opacity-100"
      >
        ← กลับโหมดเดี่ยว
      </a>
    </div>
  );
}
