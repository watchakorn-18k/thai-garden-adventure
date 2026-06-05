import { useState, useEffect } from "react";
import { CROPS, type Crop, type CropId } from "@/lib/game-types";
import {
  ChiliIcon,
  CoinIcon,
  EggplantIcon,
  MorningGloryIcon,
  RiceIcon,
  MangoIcon,
  LemongrassIcon,
  PapayaIcon,
  BasilIcon,
  SeedIcon,
} from "./PixelIcons";
import PixelCrop from "./PixelCrop";
import { SFX } from "@/lib/sfx";

const CROP_ICONS: Record<CropId, React.ComponentType<{ size?: number }>> = {
  chili: ChiliIcon,
  rice: RiceIcon,
  morning_glory: MorningGloryIcon,
  eggplant: EggplantIcon,
  mango: MangoIcon,
  lemongrass: LemongrassIcon,
  papaya: PapayaIcon,
  basil: BasilIcon,
};

function DynamicCropIcon({ cropId, stage }: { cropId: CropId; stage: number }) {
  if (stage === 0) {
    return <SeedIcon size={38} />;
  }
  if (stage === 1) {
    return (
      <div style={{ width: 38, height: 38 }}>
        <PixelCrop id={cropId} stage={0} />
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div style={{ width: 38, height: 38 }}>
        <PixelCrop id={cropId} stage={1} />
      </div>
    );
  }
  const RipeIcon = CROP_ICONS[cropId];
  return <RipeIcon size={38} />;
}

interface CropIndexBookProps {
  marketPrices?: Record<CropId, number>;
  selectedCropId?: CropId;
  onSelectCrop?: (id: CropId) => void;
  availableCropIds?: CropId[];
  compact?: boolean;
  iconOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CropIndexBook({
  marketPrices,
  selectedCropId,
  onSelectCrop,
  availableCropIds,
  compact = false,
  iconOnly = false,
  open: openProp,
  onOpenChange,
}: CropIndexBookProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openInternal;
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenInternal(next);
    onOpenChange?.(next);
  };
  const [animationStage, setAnimationStage] = useState(0);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setAnimationStage((prev) => (prev + 1) % 4);
    }, 1500);
    return () => clearInterval(interval);
  }, [open]);
  const crops = availableCropIds?.length
    ? availableCropIds.map((id) => CROPS[id]).filter(Boolean)
    : (Object.values(CROPS) as Crop[]);

  return (
    <div className={iconOnly ? "relative" : "relative z-10 w-full max-w-5xl"}>
      <button
        type="button"
        onClick={() => {
          SFX.click();
          setOpen(!open);
        }}
        className={
          iconOnly
            ? "pixel-btn flex h-[34px] items-center px-2 transition-transform duration-200 active:translate-y-[1px]"
            : "pixel-panel group flex w-full items-center justify-between gap-4 overflow-hidden px-5 py-4 text-left transition-transform duration-200 active:translate-y-[1px]"
        }
        aria-expanded={open}
        title="Crop index"
      >
        {iconOnly ? (
          <BookIcon size={22} />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div
                className="grid place-items-center transition-transform duration-300 group-hover:-translate-y-1"
                style={{
                  width: compact ? 44 : 54,
                  height: compact ? 44 : 54,
                  background: "#1a0f1f",
                  boxShadow: "inset 0 0 0 2px var(--gold), 6px 6px 0 rgba(26,15,31,0.55)",
                }}
              >
                <BookIcon size={compact ? 30 : 38} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-3">
                  <span className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">
                    CROP BOOK
                  </span>
                  <span className="h-[3px] w-8 bg-[#1a0f1f]" />
                  <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                    หนังสือพืชสวนไทย
                  </span>
                </div>
                <div className="font-pixel text-[12px] leading-relaxed text-[#f4e4c1]">
                  กดเปิดดู ราคาซื้อ ราคาขาย กำไร และเวลาเก็บเกี่ยว
                </div>
              </div>
            </div>
            <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
              {open ? "CLOSE" : "OPEN"}
            </span>
          </>
        )}
      </button>

      {open && (
        <section
          className={
            iconOnly
              ? "pixel-panel absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(640px,calc(100vw-2rem))] overflow-hidden px-5 py-5"
              : "pixel-panel mt-3 overflow-hidden px-5 py-5"
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">
              SEED LEDGER
            </div>
            <div
              className="pixel-chip flex items-center gap-2"
              data-gold="true"
              style={{ fontSize: 9 }}
            >
              <CoinIcon size={16} />
              <span>ราคาตลาดเปลี่ยนตามการขาย</span>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 gap-3 md:grid-cols-[1.1fr_0.9fr] lg:grid-cols-[1.15fr_0.95fr_0.9fr]">
            {crops.map((crop, index) => {
              const Icon = CROP_ICONS[crop.id];
              const marketPrice = Math.round(marketPrices?.[crop.id] ?? crop.sellPrice);
              const profit = marketPrice - crop.seedCost;
              const growSeconds = Math.round(crop.growTime / 1000);
              const active = selectedCropId === crop.id;

              return (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => {
                    SFX.click();
                    onSelectCrop?.(crop.id);
                  }}
                  className="group relative overflow-hidden text-left transition-transform duration-200 active:translate-y-[1px]"
                  style={{
                    minHeight: index === 0 ? 162 : 142,
                    background:
                      "linear-gradient(135deg, rgba(244,228,193,0.08), rgba(26,15,31,0.35))",
                    border: "3px solid #1a0f1f",
                    boxShadow: active
                      ? "inset 0 0 0 2px var(--gold), 0 10px 0 rgba(26,15,31,0.55)"
                      : "inset 0 0 0 2px rgba(244,228,193,0.08), 0 8px 0 rgba(26,15,31,0.5)",
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1 opacity-80"
                    style={{
                      background: "linear-gradient(90deg, var(--gold), rgba(255,210,74,0))",
                    }}
                  />
                  <div className="relative flex h-full flex-col gap-4 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="grid place-items-center transition-transform duration-300 group-hover:-translate-y-1"
                          style={{
                            width: 54,
                            height: 54,
                            background: "#1a0f1f",
                            boxShadow: "inset 0 0 0 2px var(--gold)",
                          }}
                        >
                          <DynamicCropIcon cropId={crop.id} stage={animationStage} />
                        </div>
                        <div>
                          <p className="font-pixel text-[13px] text-[#f4e4c1]">{crop.name}</p>
                          <p className="mt-1 font-pixel text-[7px] tracking-[1.5px] text-[var(--muted-foreground)]">
                            {crop.id.toUpperCase().replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <span
                        className="font-pixel text-[8px] text-[var(--gold)]"
                        style={{ textShadow: "1px 1px 0 #1a0f1f" }}
                      >
                        {growSeconds}s
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <CropBookStat label="ซื้อ" value={crop.seedCost} tone="muted" />
                      <CropBookStat label="ขาย" value={marketPrice} tone="gold" />
                      <CropBookStat
                        label="กำไร"
                        value={profit}
                        tone={profit >= 0 ? "good" : "bad"}
                      />
                    </div>

                    <div className="mt-auto">
                      <div className="mb-2 flex items-center justify-between font-pixel text-[7px] text-[var(--muted-foreground)]">
                        <span>เวลาเติบโต</span>
                        <span>{growSeconds} วินาที</span>
                      </div>
                      <div className="h-2 bg-[#1a0f1f] p-[2px]">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(38, 100 - growSeconds * 5)}%`,
                            background: "linear-gradient(90deg, #6ab04c, var(--gold))",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function CropBookStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "gold" | "good" | "bad";
}) {
  const color =
    tone === "gold"
      ? "var(--gold)"
      : tone === "good"
        ? "#8bc967"
        : tone === "bad"
          ? "#ff6b6b"
          : "#f4e4c1";

  return (
    <div
      className="flex flex-col gap-1 px-2 py-2"
      style={{
        background: "rgba(26,15,31,0.55)",
        boxShadow: "inset 0 0 0 2px rgba(244,228,193,0.08)",
      }}
    >
      <span className="font-pixel text-[6px] tracking-[1px] text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="flex items-center gap-1 font-pixel text-[10px]" style={{ color }}>
        <CoinIcon size={10} />
        {value}
      </span>
    </div>
  );
}

function BookIcon({ size = 38 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
      aria-hidden
    >
      <rect x="3" y="2" width="10" height="12" fill="#8b5a2b" />
      <rect x="4" y="2" width="8" height="1" fill="#c89a30" />
      <rect x="4" y="13" width="8" height="1" fill="#5a2f17" />
      <rect x="3" y="3" width="1" height="10" fill="#5a2f17" />
      <rect x="12" y="3" width="1" height="10" fill="#3d2412" />
      <rect x="5" y="5" width="6" height="1" fill="#f4d864" />
      <rect x="5" y="7" width="4" height="1" fill="#f4e4c1" />
      <rect x="5" y="9" width="5" height="1" fill="#f4e4c1" />
      <rect x="6" y="11" width="3" height="1" fill="#6ab04c" />
    </svg>
  );
}
