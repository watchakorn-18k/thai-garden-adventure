import { useEffect, useRef, useState } from "react";
import CosmeticPicker from "./CosmeticPicker";
import PlayerAvatarPreview from "./PlayerAvatarPreview";
import { CropIndexBookContent } from "./CropIndexBook";
import {
  CoinIcon,
  HoeIcon,
  MoonIcon,
  SeedIcon,
  SpeakerOffIcon,
  SpeakerOnIcon,
  WaterCanIcon,
} from "./PixelIcons";
import type { CropId } from "@/lib/game-types";
import { COSMETIC_PRESETS, type PlayerCosmetics } from "@/lib/player-cosmetics";
import { SFX } from "@/lib/sfx";

export type GameMenuTab = "outfit" | "shop" | "crops" | "controls" | "settings";

interface GameMenuDialogProps {
  open: boolean;
  initialTab?: GameMenuTab;
  playerName: string;
  coins: number;
  gardenTokens: number;
  unlockedPresetIds: string[];
  levelLabel: string;
  expLabel?: string;
  autoBotActive: boolean;
  muted: boolean;
  cosmetics: PlayerCosmetics;
  marketPrices: Record<CropId, number>;
  selectedCropId: CropId;
  onClose: () => void;
  onSaveName: (next: string) => void;
  onChangeCosmetics: (next: PlayerCosmetics) => void;
  onBuyPreset: (id: string) => void;
  onEquipPreset: (id: string) => void;
  onSelectCrop: (id: CropId) => void;
  onToggleAutoBot: () => void;
  onToggleMuted: () => void;
}

const TABS: { id: GameMenuTab; label: string; hint: string }[] = [
  { id: "outfit", label: "ชุด", hint: "แต่งตัว" },
  { id: "shop", label: "ร้าน", hint: "โทเคน" },
  { id: "crops", label: "พืช", hint: "ราคาตลาด" },
  { id: "controls", label: "ควบคุม", hint: "ปุ่มลัด" },
  { id: "settings", label: "ตั้งค่า", hint: "ชื่อ/เสียง" },
];

export default function GameMenuDialog({
  open,
  initialTab = "outfit",
  playerName,
  coins,
  gardenTokens,
  unlockedPresetIds,
  levelLabel,
  expLabel,
  autoBotActive,
  muted,
  cosmetics,
  marketPrices,
  selectedCropId,
  onClose,
  onSaveName,
  onChangeCosmetics,
  onBuyPreset,
  onEquipPreset,
  onSelectCrop,
  onToggleAutoBot,
  onToggleMuted,
}: GameMenuDialogProps) {
  const [activeTab, setActiveTab] = useState<GameMenuTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="game-menu-backdrop" onClick={onClose}>
      <section
        className="pixel-panel game-menu-dialog help-modal-pop"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-menu-title"
      >
        <div className="game-menu-head">
          <div>
            <div id="game-menu-title" className="game-menu-title">
              สวนของฉัน
            </div>
            <div className="game-menu-subtitle">
              {playerName || "ยังไม่ได้ตั้งชื่อ"} · {levelLabel}
              {expLabel ? ` · ${expLabel}` : ""}
            </div>
          </div>
          <div className="game-menu-head-actions">
            <span className="pixel-chip flex items-center gap-2" data-gold="true">
              <CoinIcon size={16} />
              {coins}
            </span>
            <span className="pixel-chip flex items-center gap-2 shop-price-chip">
              GT {gardenTokens}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="pixel-btn game-menu-close"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="game-menu-tabs" aria-label="เมนูผู้เล่น">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="pixel-btn game-menu-tab"
              data-active={activeTab === tab.id ? "true" : undefined}
              onClick={() => {
                setActiveTab(tab.id);
                SFX.click();
              }}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
            </button>
          ))}
        </nav>

        <div className="game-menu-body custom-scrollbar">
          {activeTab === "outfit" && (
            <CosmeticPicker value={cosmetics} onChange={onChangeCosmetics} />
          )}

          {activeTab === "shop" && (
            <ShopContent
              gardenTokens={gardenTokens}
              unlockedPresetIds={unlockedPresetIds}
              cosmetics={cosmetics}
              onBuyPreset={onBuyPreset}
              onEquipPreset={onEquipPreset}
            />
          )}

          {activeTab === "crops" && (
            <CropIndexBookContent
              marketPrices={marketPrices}
              selectedCropId={selectedCropId}
              onSelectCrop={onSelectCrop}
            />
          )}

          {activeTab === "controls" && <ControlsGuide />}

          {activeTab === "settings" && (
            <div className="game-menu-settings-grid">
              <NameEditor name={playerName} onSave={onSaveName} />

              <button
                type="button"
                className="pixel-btn game-menu-setting-card"
                onClick={onToggleMuted}
              >
                <span className="game-menu-setting-icon">
                  {muted ? <SpeakerOffIcon size={24} /> : <SpeakerOnIcon size={24} />}
                </span>
                <span>
                  <b>{muted ? "เปิดเสียง" : "ปิดเสียง"}</b>
                  <small>ปุ่มลัด M ยังใช้ได้ตอนปิดเมนู</small>
                </span>
              </button>

              <button
                type="button"
                className="pixel-btn game-menu-setting-card"
                data-active={autoBotActive ? "true" : undefined}
                onClick={onToggleAutoBot}
              >
                <span
                  className={autoBotActive ? "live-dot game-menu-live-dot" : "game-menu-idle-dot"}
                />
                <span>
                  <b>{autoBotActive ? "หยุดอัตโนมัติ" : "เริ่มอัตโนมัติ"}</b>
                  <small>{autoBotActive ? "บอทกำลังช่วยทำสวน" : "บอทหยุดอยู่"}</small>
                </span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function sameCosmetics(a: PlayerCosmetics, b: PlayerCosmetics): boolean {
  return (
    a.hat.toLowerCase() === b.hat.toLowerCase() &&
    a.shirt.toLowerCase() === b.shirt.toLowerCase() &&
    a.pants.toLowerCase() === b.pants.toLowerCase() &&
    a.hatShape === b.hatShape &&
    a.shirtStyle === b.shirtStyle &&
    a.aura === b.aura
  );
}

function ShopContent({
  gardenTokens,
  unlockedPresetIds,
  cosmetics,
  onBuyPreset,
  onEquipPreset,
}: {
  gardenTokens: number;
  unlockedPresetIds: string[];
  cosmetics: PlayerCosmetics;
  onBuyPreset: (id: string) => void;
  onEquipPreset: (id: string) => void;
}) {
  return (
    <div className="shop-preset-grid">
      {COSMETIC_PRESETS.map((preset) => {
        const unlocked = preset.price === 0 || unlockedPresetIds.includes(preset.id);
        const equipped = sameCosmetics(cosmetics, preset.cosmetics);
        const affordable = gardenTokens >= preset.price;
        return (
          <article
            key={preset.id}
            className="shop-preset-card"
            data-equipped={equipped ? "true" : undefined}
          >
            <div className="shop-preset-preview-wrap" data-aura={preset.cosmetics.aura}>
              <PlayerAvatarPreview className="shop-preset-preview" cosmetics={preset.cosmetics} />
              {preset.cosmetics.aura !== "none" && (
                <>
                  <span className="shop-effect-ring" aria-hidden />
                  <span className="shop-effect-badge">EFFECT</span>
                </>
              )}
            </div>
            <div className="shop-preset-meta">
              <h3>{preset.name}</h3>
              <p>{preset.description}</p>
              <span className="pixel-chip shop-price-chip">GT {preset.price}</span>
            </div>
            <div className="shop-preset-actions">
              {unlocked ? (
                <button
                  type="button"
                  className="pixel-btn"
                  data-active={equipped ? "true" : undefined}
                  disabled={equipped}
                  onClick={() => onEquipPreset(preset.id)}
                >
                  {equipped ? "ใส่อยู่" : "ใส่ชุด"}
                </button>
              ) : (
                <button
                  type="button"
                  className="pixel-btn"
                  disabled={!affordable}
                  onClick={() => onBuyPreset(preset.id)}
                >
                  ซื้อ+ใส่
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function NameEditor({ name, onSave }: { name: string; onSave: (next: string) => void }) {
  const [draft, setDraft] = useState(name.slice(0, 6));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name.slice(0, 6));
  }, [name]);

  const save = () => onSave(draft.trim().slice(0, 6));

  return (
    <div className="game-menu-name-card">
      <label className="flex flex-col gap-2">
        <span className="game-menu-kicker">ตั้งชื่อ</span>
        <input
          ref={inputRef}
          value={draft}
          maxLength={6}
          onChange={(event) => setDraft(event.target.value.slice(0, 6))}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="พิมพ์ชื่อ"
          className="pixel-chip font-pixel text-[12px] px-3 py-2 outline-none"
        />
        <small className="game-menu-name-hint">สูงสุด 6 ตัวอักษร</small>
      </label>
      <button type="button" onClick={save} className="pixel-btn game-menu-save-name">
        บันทึก
      </button>
    </div>
  );
}

function ControlsGuide() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_3px_1fr] gap-6 md:gap-7 items-start">
      <div className="flex flex-col gap-5 min-w-[220px]">
        <div className="flex items-start gap-4">
          <div className="grid grid-cols-3 grid-rows-2 gap-1 shrink-0">
            <span />
            <kbd className="pixel-key">W</kbd>
            <span />
            <kbd className="pixel-key">A</kbd>
            <kbd className="pixel-key">S</kbd>
            <kbd className="pixel-key">D</kbd>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="font-pixel text-[10px] tracking-wider">เดิน</span>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)] leading-relaxed">
              เดินสำรวจ · ลูกศรก็ได้
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <kbd className="pixel-key pixel-key-wide">SPACE</kbd>
          <div className="flex flex-col gap-1">
            <span className="font-pixel text-[10px] tracking-wider">ใช้เครื่องมือ</span>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
              ทำกับช่องที่หันหน้าใส่
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)] mr-1">
            เลือกเครื่องมือ
          </span>
          <kbd className="pixel-key pixel-key-sm">E</kbd>
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">จอบ</span>
          <kbd className="pixel-key pixel-key-sm">Q</kbd>
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">บัวรดน้ำ</span>
          <span className="font-pixel text-[8px] text-[var(--gold)]">เมล็ดใช้เมาส์เลือก</span>
        </div>
      </div>

      <span className="hidden md:block w-[3px] self-stretch bg-[#1a0f1f]" />

      <div className="flex flex-col gap-3 min-w-0">
        <span className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">ขั้นตอน</span>
        <div className="flow-strip">
          <FlowStep n="01" label="ขุด" sub="ขุด">
            <HoeIcon size={20} />
          </FlowStep>
          <FlowArrow />
          <FlowStep n="02" label="หว่าน" sub="หว่าน">
            <SeedIcon size={20} />
          </FlowStep>
          <FlowArrow />
          <FlowStep n="03" label="รดน้ำ" sub="รดน้ำ">
            <WaterCanIcon size={20} />
          </FlowStep>
          <FlowArrow />
          <FlowStep n="04" label="รอ" sub="พักผ่อน">
            <MoonIcon size={18} />
          </FlowStep>
          <FlowArrow />
          <FlowStep n="05" label="เก็บเกี่ยว" sub="เก็บ" gold>
            <CoinIcon size={18} />
          </FlowStep>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  n,
  label,
  sub,
  gold,
  children,
}: {
  n: string;
  label: string;
  sub: string;
  gold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flow-step" data-gold={gold ? "true" : undefined}>
      <span>{n}</span>
      {children}
      <b>{label}</b>
      <small>{sub}</small>
    </div>
  );
}

function FlowArrow() {
  return <span className="flow-arrow">→</span>;
}
