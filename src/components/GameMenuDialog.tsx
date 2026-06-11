import { useEffect, useRef, useState } from "react";
import CosmeticPicker from "./CosmeticPicker";
import PixelFarmer from "./PixelFarmer";
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
  onAddGardenTokens?: () => void;
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
  onAddGardenTokens,
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
            <span className="pixel-chip flex items-center gap-2 shop-price-chip">
              GT {gardenTokens}
            </span>
            {onAddGardenTokens && (
              <button
                type="button"
                onClick={() => {
                  SFX.coin();
                  onAddGardenTokens();
                }}
                className="pixel-btn px-3 py-2 font-pixel text-[8px]"
                title="DEV: เพิ่ม Garden Tokens"
              >
                +GT
              </button>
            )}
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
    a.shoe.toLowerCase() === b.shoe.toLowerCase() &&
    a.hatShape === b.hatShape &&
    a.shirtStyle === b.shirtStyle &&
    a.aura === b.aura &&
    a.shoeTrail === b.shoeTrail &&
    a.hoeSkin === b.hoeSkin &&
    a.wateringCanSkin === b.wateringCanSkin &&
    a.basketSkin === b.basketSkin
  );
}

type ShopCategoryId = "all" | "hat" | "shirt" | "pants" | "shoes" | "skill" | "etc";

const SHOP_CATEGORIES: { id: ShopCategoryId; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "hat", label: "หมวก" },
  { id: "shirt", label: "เสื้อ" },
  { id: "pants", label: "กางเกง" },
  { id: "shoes", label: "รองเท้า" },
  { id: "skill", label: "สกิลอุปกรณ์" },
  { id: "etc", label: "อื่นๆ" },
];

const PRESET_CATEGORIES: Record<string, ShopCategoryId[]> = {
  golden_hoe: ["skill"],
  aqua_hoe: ["skill"],
  starlight_hoe: ["skill"],
  golden_watering_can: ["skill"],
  aqua_watering_can: ["skill"],
  starlight_watering_can: ["skill"],
  golden_basket: ["skill"],
  aqua_basket: ["skill"],
  starlight_basket: ["skill"],
  fire_shoes: ["shoes"],
  lightning_shoes: ["shoes"],
  classic_farmer: ["hat", "shirt", "pants"],
  rice_farmer: ["hat", "shirt", "pants"],
  chili_red: ["shirt", "pants"],
  river_blue: ["hat", "shirt", "pants"],
  mango_gold: ["hat", "shirt", "pants"],
  night_violet: ["hat", "shirt", "pants"],
};

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
  const [activeCategory, setActiveCategory] = useState<ShopCategoryId>("all");
  const presets = COSMETIC_PRESETS.filter((preset) => {
    if (activeCategory === "all") return true;
    return (PRESET_CATEGORIES[preset.id] ?? ["etc"]).includes(activeCategory);
  });

  return (
    <div className="shop-content">
      <div className="shop-category-tabs" aria-label="หมวดหมู่ร้านค้า">
        {SHOP_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className="pixel-btn shop-category-tab"
            data-active={activeCategory === category.id ? "true" : undefined}
            onClick={() => {
              setActiveCategory(category.id);
              SFX.click();
            }}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="shop-preset-grid">
        {presets.map((preset) => {
          const unlocked = preset.price === 0 || unlockedPresetIds.includes(preset.id);
          const categories = PRESET_CATEGORIES[preset.id] ?? [];
          const isBasketPreset = preset.id.includes("_basket");
          const isToolPreset = categories.includes("skill") && !isBasketPreset;
          const isShoePreset = categories.includes("shoes");
          const equipped = isBasketPreset
            ? cosmetics.basketSkin === preset.cosmetics.basketSkin
            : isToolPreset
              ? preset.id.includes("watering_can")
                ? cosmetics.wateringCanSkin === preset.cosmetics.wateringCanSkin
                : cosmetics.hoeSkin === preset.cosmetics.hoeSkin
              : isShoePreset
                ? cosmetics.shoe.toLowerCase() === preset.cosmetics.shoe.toLowerCase() &&
                  cosmetics.shoeTrail === preset.cosmetics.shoeTrail
                : sameCosmetics(cosmetics, preset.cosmetics);
          const affordable = gardenTokens >= preset.price;
          return (
            <article
              key={preset.id}
              className="shop-preset-card"
              data-equipped={equipped ? "true" : undefined}
            >
              <div className="shop-preset-preview-wrap" data-aura={preset.cosmetics.aura}>
                <span className="shop-preview-label">
                  {isBasketPreset
                    ? "ตะกร้าคนขาย"
                    : isToolPreset
                      ? "อุปกรณ์"
                      : isShoePreset
                        ? "รอยเท้า"
                        : "ลองใส่แล้ว"}
                </span>
                {isBasketPreset ? (
                  <BasketSkinPreview cosmetics={preset.cosmetics} />
                ) : isToolPreset ? (
                  <ToolSkinPreview presetId={preset.id} cosmetics={preset.cosmetics} />
                ) : isShoePreset ? (
                  <ShoeTrailPreview cosmetics={preset.cosmetics} />
                ) : (
                  <PlayerAvatarPreview
                    className="shop-preset-preview"
                    cosmetics={preset.cosmetics}
                  />
                )}
                {(preset.cosmetics.aura !== "none" ||
                  isToolPreset ||
                  isShoePreset ||
                  isBasketPreset) && (
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
    </div>
  );
}

function ShoeTrailPreview({ cosmetics }: { cosmetics: PlayerCosmetics }) {
  const trail = cosmetics.shoeTrail;
  return (
    <div className="shop-shoe-preview" aria-hidden>
      <PlayerAvatarPreview className="shop-preset-preview" cosmetics={cosmetics} />
      {trail !== "none" && (
        <span className={`shop-shoe-trail-demo shop-shoe-trail-demo-${trail}`} />
      )}
    </div>
  );
}

const BASKET_TRIM: Record<
  PlayerCosmetics["basketSkin"],
  { rim: string; band: string; glow: string }
> = {
  basic: { rim: "#a06a3a", band: "#6b3a1b", glow: "transparent" },
  golden: { rim: "#ffd24a", band: "#d99b1f", glow: "#fff5b8" },
  aqua: { rim: "#7fd8ff", band: "#2a6e9e", glow: "#7fd8ff" },
  starlight: { rim: "#c08bd9", band: "#4a2f5c", glow: "#c08bd9" },
};

function BasketSkinPreview({ cosmetics }: { cosmetics: PlayerCosmetics }) {
  const trim = BASKET_TRIM[cosmetics.basketSkin];
  return (
    <div className="shop-tool-preview" data-skin={cosmetics.basketSkin} aria-hidden>
      <span className="shop-tool-sprite">
        <svg viewBox="0 0 16 16" width="100%" height="100%" shapeRendering="crispEdges">
          {trim.glow !== "transparent" && (
            <rect x={2} y={4} width={12} height={9} fill={trim.glow} opacity={0.3} />
          )}
          <rect x={5} y={2} width={6} height={1} fill={trim.band} />
          <rect x={4} y={4} width={8} height={1} fill={trim.rim} />
          <rect x={3} y={5} width={10} height={7} fill="#8b5a2b" />
          <rect x={4} y={6} width={8} height={5} fill="#5a2f17" />
          <rect x={3} y={9} width={10} height={1} fill={trim.band} />
          <rect x={5} y={6} width={2} height={2} fill="#6ab04c" />
          <rect x={8} y={6} width={2} height={2} fill="#e84444" />
          <rect
            x={11}
            y={4}
            width={1}
            height={1}
            fill={trim.glow === "transparent" ? trim.rim : trim.glow}
          />
        </svg>
      </span>
      <span className="shop-tool-hit-effect" />
      <span className="shop-tool-particle shop-tool-particle-a" />
      <span className="shop-tool-particle shop-tool-particle-b" />
    </div>
  );
}

function ToolSkinPreview({
  presetId,
  cosmetics,
}: {
  presetId: string;
  cosmetics: PlayerCosmetics;
}) {
  const tool = presetId.includes("watering_can") ? "watering_can" : "hoe";
  const skin = tool === "watering_can" ? cosmetics.wateringCanSkin : cosmetics.hoeSkin;
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setLoop((current) => current + 1), 720);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="shop-tool-preview" data-tool={tool} data-skin={skin} aria-hidden>
      <span className="shop-tool-sprite">
        <PixelFarmer
          key={`${tool}:${skin}:${loop}`}
          direction="right"
          walking={false}
          walkFrame={0}
          acting={true}
          tool={tool}
          cosmetics={cosmetics}
        />
      </span>
      <span className="shop-tool-hit-effect" />
      <span className="shop-tool-particle shop-tool-particle-a" />
      <span className="shop-tool-particle shop-tool-particle-b" />
      <span className="shop-tool-particle shop-tool-particle-c" />
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
