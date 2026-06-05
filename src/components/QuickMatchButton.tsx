import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { requestQuickMatch } from "@/lib/match-client";
import { SFX } from "@/lib/sfx";

interface Props {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

// One-tap matchmaking: asks the server to pair you, then drops you into the
// room as a player. No room code, no manual room creation.
export default function QuickMatchButton({ label = "QUICK MATCH", className, style }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (busy) return;
    SFX.click();
    setBusy(true);
    setError(null);
    try {
      const code = await requestQuickMatch();
      navigate({ to: "/match/$code", params: { code }, search: { role: "player" } });
    } catch {
      setError("จับคู่ไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className={className ?? "pixel-btn"}
        data-accent="true"
        style={style}
      >
        <span className="font-pixel text-[12px]">{busy ? "กำลังหาคู่..." : label}</span>
      </button>
      {error && (
        <span className="font-pixel text-[8px]" style={{ color: "#ff6b6b" }}>
          {error}
        </span>
      )}
    </div>
  );
}
