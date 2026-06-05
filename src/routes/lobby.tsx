import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { makeRoomCode, ROOM_CODE_RE } from "@/lib/match-protocol";
import QuickMatchButton from "@/components/QuickMatchButton";
import { SpeakerOffIcon, SpeakerOnIcon } from "@/components/PixelIcons";
import { SFX, setMuted, startBgm, stopBgm } from "@/lib/sfx";

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
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    setMuted(!musicEnabled);
    if (musicEnabled) {
      startBgm();
    } else {
      stopBgm();
    }

    const play = () => {
      if (musicEnabled) startBgm();
    };
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      stopBgm();
      setMuted(false);
    };
  }, [musicEnabled]);

  const toggleMusic = () => {
    SFX.click();
    setMusicEnabled((current) => !current);
  };

  const saveName = (n: string) => {
    setName(n);
    if (typeof window !== "undefined") localStorage.setItem("tg.name", n);
  };

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อก่อน");
    const code = joinCode.trim().toUpperCase() || makeRoomCode();
    if (!ROOM_CODE_RE.test(code)) return setError("รหัสห้องไม่ถูกต้อง (6 ตัว A-Z 2-9)");
    navigate({
      to: "/match/$code",
      params: { code },
      search: { role: "spectator" },
    });
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
      <div className="sky-stars" />

      <button
        onClick={toggleMusic}
        className="pixel-btn fixed right-4 top-4 z-20 flex h-12 w-12 items-center justify-center p-0"
        data-active={musicEnabled ? "true" : undefined}
        aria-label={musicEnabled ? "ปิดเพลง" : "เปิดเพลง"}
        title={musicEnabled ? "ปิดเพลง" : "เปิดเพลง"}
      >
        {musicEnabled ? <SpeakerOnIcon size={24} /> : <SpeakerOffIcon size={24} />}
      </button>

      <header className="relative z-10 flex flex-col items-center gap-2">
        <h1
          className="font-pixel text-[28px] text-[var(--gold)]"
          style={{ textShadow: "3px 3px 0 #1a0f1f, 0 0 24px rgba(255,210,74,0.4)" }}
        >
          โหมดแข่ง 1v1
        </h1>
        <p className="font-pixel text-[9px] text-[var(--muted-foreground)]">
          คนสร้างห้องตั้งค่าด่าน เป้าหมาย เวลา และเตะผู้เล่นได้ก่อนเริ่ม
        </p>
      </header>

      <div className="relative z-10 pixel-panel p-6 flex flex-col gap-5 min-w-[360px]">
        <div className="flex flex-col gap-2 items-center">
          <QuickMatchButton label="จับคู่ด่วน" className="pixel-btn w-full justify-center py-3" />
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)] text-center">
            กดปุ่มเดียว จับคู่อัตโนมัติ ไม่ต้องสร้างห้อง
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-0.5 flex-1 bg-background" />
          <span className="font-pixel text-[8px] text-muted-foreground">หรือ</span>
          <span className="h-0.5 flex-1 bg-background" />
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">ชื่อผู้เล่น</span>
          <input
            value={name}
            onChange={(e) => saveName(e.target.value.slice(0, 16))}
            placeholder="พิมพ์ชื่อ"
            className="pixel-chip font-pixel text-[12px] px-3 py-2 outline-none"
            style={{ minWidth: 200 }}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">รหัสห้อง</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="ว่างไว้เพื่อสร้างห้องใหม่"
            className="pixel-chip font-pixel text-[14px] tracking-[4px] px-3 py-2 outline-none flex-1 text-center"
          />
          <button onClick={join} className="pixel-btn" data-accent="true">
            <span className="font-pixel text-[12px]">เข้าร่วม / สร้างห้อง</span>
          </button>
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)] text-center">
            ทุกคนเริ่มเป็นผู้ชมก่อน แล้วค่อยกดลงแข่งในห้อง
          </span>
        </div>

        {error && (
          <div className="font-pixel text-[9px]" style={{ color: "#ff6b6b" }}>
            {error}
          </div>
        )}
      </div>

      <a
        href="/"
        className="pixel-btn relative z-10 inline-flex items-center gap-2 px-4 py-2 no-underline"
        style={{ fontSize: 9 }}
      >
        <span aria-hidden>←</span>
        กลับโหมดเดี่ยว
      </a>
    </div>
  );
}
