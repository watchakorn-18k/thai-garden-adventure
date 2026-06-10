import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import QuickMatchButton from "@/components/QuickMatchButton";
import { SpeakerOffIcon, SpeakerOnIcon } from "@/components/PixelIcons";
import { listOpenRooms } from "@/lib/match-client";
import { loadPlayerName, savePlayerName } from "@/lib/player-name";
import { SFX, setMuted, startBgm, stopBgm } from "@/lib/sfx";
import {
  makeRoomCode,
  ROOM_CODE_RE,
  type LobbyRoomSummary,
  type MatchModeSetting,
} from "@/lib/match-protocol";

export const Route = createFileRoute("/lobby")({
  validateSearch: (search: Record<string, unknown>): { mode: MatchModeSetting } => ({
    mode: search.mode === "2v2" ? "2v2" : "1v1",
  }),
  head: () => ({
    meta: [{ title: "Lobby — สวนผักไทย" }],
  }),
  component: LobbyPage,
});

const ROOM_PAGE_SIZE = 4;
const STAGE_LABEL: Record<LobbyRoomSummary["stage"], string> = {
  classic: "สวนคลาสสิก",
  water: "คลองน้ำ",
  festival: "งานวัด",
};

function LobbyPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const is2v2 = mode === "2v2";
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomPage, setRoomPage] = useState(0);

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

  useEffect(() => {
    setName(loadPlayerName());
  }, []);

  const refreshRooms = useCallback(async (showLoading = false) => {
    if (showLoading) setRoomsLoading(true);
    else setRoomsRefreshing(true);
    try {
      const nextRooms = await listOpenRooms();
      setRooms(nextRooms);
      setRoomsError(null);
    } catch {
      setRoomsError("โหลดรายชื่อห้องไม่ได้");
    } finally {
      setRoomsLoading(false);
      setRoomsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshRooms(true);
    const timer = window.setInterval(() => void refreshRooms(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshRooms]);

  const saveName = (n: string) => {
    setName(n);
    savePlayerName(n);
  };

  const modeRooms = useMemo(() => rooms.filter((room) => room.mode === mode), [rooms, mode]);
  const pageCount = Math.max(1, Math.ceil(modeRooms.length / ROOM_PAGE_SIZE));
  const safePage = Math.min(roomPage, pageCount - 1);
  const visibleRooms = modeRooms.slice(
    safePage * ROOM_PAGE_SIZE,
    safePage * ROOM_PAGE_SIZE + ROOM_PAGE_SIZE,
  );

  useEffect(() => {
    setRoomPage(0);
  }, [mode]);

  useEffect(() => {
    if (roomPage > pageCount - 1) setRoomPage(pageCount - 1);
  }, [pageCount, roomPage]);

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อก่อน");
    const code = joinCode.trim().toUpperCase() || makeRoomCode();
    if (!ROOM_CODE_RE.test(code)) return setError("รหัสห้องไม่ถูกต้อง (6 ตัว A-Z 2-9)");
    navigate({
      to: "/match/$code",
      params: { code },
      search: { role: "spectator", mode },
    });
  };

  const joinRoom = (room: LobbyRoomSummary) => {
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อก่อน");
    setError(null);
    navigate({
      to: "/match/$code",
      params: { code: room.code },
      search: { role: "spectator", mode: room.mode },
    });
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 overflow-hidden p-6">
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

      <header className="relative z-10 flex flex-col items-center gap-2 text-center">
        <h1
          className="font-pixel text-[28px] text-[var(--gold)]"
          style={{ textShadow: "3px 3px 0 #1a0f1f, 0 0 24px rgba(255,210,74,0.4)" }}
        >
          {is2v2 ? "โหมดแข่ง 2v2" : "โหมดแข่ง 1v1"}
        </h1>
        <p className="font-pixel max-w-[760px] text-[9px] leading-5 text-[var(--muted-foreground)]">
          {is2v2
            ? "ทีม 4 คน · ชาวสวนปลูก คนขายวิ่งส่งตลาด · คนสร้างห้องตั้งค่าได้"
            : "คนสร้างห้องตั้งค่าด่าน เป้าหมาย เวลา และเตะผู้เล่นได้ก่อนเริ่ม"}
        </p>
      </header>

      <main className="lobby-room-shell relative z-10">
        <section className="pixel-panel flex min-w-[320px] flex-col gap-5 p-6">
          {is2v2 ? (
            <div className="flex flex-col items-center gap-2">
              <span className="pixel-chip font-pixel text-[10px]" data-gold="true">
                2v2 · ทีมละ 2 คน
              </span>
              <span className="font-pixel text-center text-[8px] text-[var(--muted-foreground)]">
                สร้างห้องแล้วส่งรหัสให้เพื่อนครบ 4 คน · ห้องตั้งเป็น 2v2 อัตโนมัติ
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <QuickMatchButton
                  label="จับคู่ด่วน"
                  className="pixel-btn w-full justify-center py-3"
                />
                <span className="font-pixel text-center text-[8px] text-[var(--muted-foreground)]">
                  กดปุ่มเดียว จับคู่อัตโนมัติ ไม่ต้องสร้างห้อง
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="h-0.5 flex-1 bg-background" />
                <span className="font-pixel text-[8px] text-muted-foreground">หรือ</span>
                <span className="h-0.5 flex-1 bg-background" />
              </div>
            </>
          )}

          <label className="flex flex-col gap-2">
            <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">
              ชื่อผู้เล่น
            </span>
            <input
              value={name}
              onChange={(e) => saveName(e.target.value.slice(0, 16))}
              placeholder="พิมพ์ชื่อ"
              className="pixel-chip font-pixel px-3 py-2 text-[12px] outline-none"
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
              className="pixel-chip font-pixel flex-1 px-3 py-2 text-center text-[14px] tracking-[4px] outline-none"
            />
            <button onClick={join} className="pixel-btn" data-accent="true">
              <span className="font-pixel text-[12px]">เข้าร่วม / สร้างห้อง</span>
            </button>
            <span className="font-pixel text-center text-[8px] text-[var(--muted-foreground)]">
              ทุกคนเริ่มเป็นผู้ชมก่อน แล้วค่อยกดลงแข่งในห้อง
            </span>
          </div>

          {error && (
            <div className="font-pixel text-[9px]" style={{ color: "#ff6b6b" }}>
              {error}
            </div>
          )}
        </section>

        <section className="lobby-room-board" aria-labelledby="open-rooms-title">
          <div className="lobby-room-board-head">
            <h2 id="open-rooms-title" className="font-pixel text-[12px] text-[var(--gold)]">
              ห้องที่เปิดอยู่
            </h2>
            <span className="lobby-room-count">{modeRooms.length} ห้องเปิด</span>
            <p className="lobby-room-note">
              แสดงเฉพาะโหมด {mode} · กดห้องเพื่อเข้าไปดูแล้วเลือกลงแข่ง
            </p>
            <button
              className="pixel-btn lobby-room-refresh"
              onClick={() => void refreshRooms()}
              disabled={roomsRefreshing}
              type="button"
            >
              {roomsRefreshing ? "กำลังดู" : "รีเฟรช"}
            </button>
          </div>

          <div className="lobby-room-list">
            {roomsLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="lobby-room-skeleton" />
              ))
            ) : roomsError ? (
              <div className="lobby-room-empty">
                <span className="font-pixel text-[10px] text-[var(--gold)]">สัญญาณขาดหาย</span>
                <span className="text-sm text-[var(--muted-foreground)]">{roomsError}</span>
              </div>
            ) : visibleRooms.length === 0 ? (
              <div className="lobby-room-empty">
                <span className="font-pixel text-[10px] text-[var(--gold)]">ยังไม่มีห้องว่าง</span>
                <span className="text-sm text-[var(--muted-foreground)]">
                  สร้างห้องแรก หรือรอชาวสวนคนอื่นเปิดสนาม
                </span>
              </div>
            ) : (
              visibleRooms.map((room) => <RoomCard key={room.code} room={room} onJoin={joinRoom} />)
            )}
          </div>

          <div className="lobby-room-pager">
            <button
              className="pixel-btn px-3 py-2 text-[8px]"
              onClick={() => setRoomPage((page) => Math.max(0, page - 1))}
              disabled={safePage === 0}
            >
              ก่อนหน้า
            </button>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
              หน้า {safePage + 1}/{pageCount}
            </span>
            <button
              className="pixel-btn px-3 py-2 text-[8px]"
              onClick={() => setRoomPage((page) => Math.min(pageCount - 1, page + 1))}
              disabled={safePage >= pageCount - 1}
            >
              ถัดไป
            </button>
          </div>
        </section>
      </main>

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

function RoomCard({
  room,
  onJoin,
}: {
  room: LobbyRoomSummary;
  onJoin: (room: LobbyRoomSummary) => void;
}) {
  const filled = Math.min(room.players, room.maxPlayers);
  return (
    <button className="lobby-room-card" onClick={() => onJoin(room)} type="button">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2 text-left">
          <span className="lobby-room-code">{room.code}</span>
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
            {room.mode} · {STAGE_LABEL[room.stage]}
          </span>
        </div>
        <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
          {room.players}/{room.maxPlayers}
        </span>
      </div>
      <div className="lobby-room-meter" aria-label={`${room.players} จาก ${room.maxPlayers} คน`}>
        {Array.from({ length: room.maxPlayers }).map((_, idx) => (
          <span key={idx} data-filled={idx < filled ? "true" : undefined} />
        ))}
      </div>
      <span className="font-pixel text-left text-[8px] text-[var(--foreground)]">เข้าห้องนี้</span>
    </button>
  );
}
