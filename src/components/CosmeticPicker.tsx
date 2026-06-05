import PixelFarmer from "./PixelFarmer";
import { COSMETIC_PALETTES, type PlayerCosmetics } from "@/lib/player-cosmetics";

interface Props {
  value: PlayerCosmetics;
  onChange: (next: PlayerCosmetics) => void;
  compact?: boolean;
  onClose?: () => void;
}

const LABELS: Record<keyof PlayerCosmetics, string> = {
  hat: "หมวก",
  shirt: "เสื้อ",
  pants: "กางเกง",
};

export default function CosmeticPicker({ value, onChange, compact = false, onClose }: Props) {
  const set = (part: keyof PlayerCosmetics, color: string) => onChange({ ...value, [part]: color });
  return (
    <div
      className={`pixel-panel flex ${compact ? "items-center gap-3 px-4 py-3" : "flex-col gap-4 p-4"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div style={{ width: compact ? 42 : 56, height: compact ? 42 : 56 }}>
            <PixelFarmer
              direction="down"
              walking={false}
              walkFrame={0}
              acting={false}
              tool="hoe"
              cosmetics={value}
            />
          </div>
          <span className="font-pixel text-[9px] text-[var(--gold)]">ชุด</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="pixel-btn px-2 py-1">
            <span className="font-pixel text-[8px]">ปิด</span>
          </button>
        )}
      </div>
      <div className="grid gap-3">
        {(Object.keys(COSMETIC_PALETTES) as (keyof PlayerCosmetics)[]).map((part) => (
          <div key={part} className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="font-pixel text-[9px] text-[var(--muted-foreground)]">
              {LABELS[part]}
            </span>
            <div className="grid grid-cols-5 gap-1">
              {COSMETIC_PALETTES[part].map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${LABELS[part]} ${color}`}
                  onClick={() => set(part, color)}
                  className="h-6 w-6 transition-transform active:translate-y-[1px]"
                  style={{
                    background: color,
                    boxShadow:
                      value[part] === color
                        ? "0 0 0 2px #1a0f1f, 0 0 0 4px var(--gold)"
                        : "0 0 0 2px #1a0f1f",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
