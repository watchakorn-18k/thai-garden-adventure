import PlayerAvatarPreview from "./PlayerAvatarPreview";
import type { PlayerCosmetics } from "@/lib/player-cosmetics";

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

const CHANNELS = ["r", "g", "b"] as const;
type Channel = (typeof CHANNELS)[number];

function hexToRgb(hex: string): Record<Channel, number> {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function rgbToHex(rgb: Record<Channel, number>): string {
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function randomColor(): string {
  return rgbToHex({
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  });
}

export default function CosmeticPicker({ value, onChange, compact = false, onClose }: Props) {
  const setChannel = (part: keyof PlayerCosmetics, channel: Channel, nextValue: number) => {
    const rgb = hexToRgb(value[part]);
    const next = rgbToHex({ ...rgb, [channel]: nextValue });
    onChange({ ...value, [part]: next });
  };

  const randomizeAll = () => {
    onChange({
      hat: randomColor(),
      shirt: randomColor(),
      pants: randomColor(),
    });
  };

  return (
    <div className={`pixel-panel cosmetic-picker ${compact ? "cosmetic-picker-compact" : ""}`}>
      <div className="cosmetic-picker-head">
        <PlayerAvatarPreview className="cosmetic-picker-preview" cosmetics={value} />
        <div className="min-w-0">
          <div className="cosmetic-picker-title">แต่งตัว</div>
          <div className="cosmetic-picker-subtitle">เลื่อน RGB 0–255 เพื่อเลือกสีละเอียด</div>
        </div>
        <div className="cosmetic-picker-actions">
          <button type="button" onClick={randomizeAll} className="pixel-btn cosmetic-picker-random">
            สุ่มสี
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="pixel-btn cosmetic-picker-close">
              ปิด
            </button>
          )}
        </div>
      </div>

      <div className="cosmetic-picker-rows">
        {(Object.keys(LABELS) as (keyof PlayerCosmetics)[]).map((part) => {
          const rgb = hexToRgb(value[part]);
          return (
            <section key={part} className="cosmetic-rgb-row" aria-label={LABELS[part]}>
              <div className="cosmetic-color-label">
                <span>{LABELS[part]}</span>
                <small>{value[part].toUpperCase()}</small>
              </div>
              <div
                className="cosmetic-current-chip"
                style={{ background: value[part] }}
                aria-hidden
              />
              <div className="cosmetic-rgb-sliders">
                {CHANNELS.map((channel) => (
                  <label key={channel} className="cosmetic-rgb-channel">
                    <span>{channel.toUpperCase()}</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={rgb[channel]}
                      onChange={(event) => setChannel(part, channel, Number(event.target.value))}
                      style={{ ["--rgb-value" as string]: `${(rgb[channel] / 255) * 100}%` }}
                    />
                    <b>{rgb[channel]}</b>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
