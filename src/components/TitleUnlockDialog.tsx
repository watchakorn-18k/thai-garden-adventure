import { SFX } from "@/lib/sfx";

export default function TitleUnlockDialog({
  level,
  title,
  onClose,
}: {
  level: number;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[rgba(10,5,15,0.78)] p-4">
      <div className="pixel-panel help-modal-pop flex w-[min(420px,92vw)] flex-col items-center gap-4 p-6 text-center">
        <div className="font-pixel text-[9px] tracking-[2px] text-[var(--muted-foreground)]">
          ปลดล็อกฉายาใหม่
        </div>
        <div className="font-pixel text-[14px] text-[var(--gold)]">LV {level}</div>
        <div className="font-pixel text-[13px] leading-relaxed text-[var(--foreground)]">
          {title}
        </div>
        <button
          type="button"
          className="pixel-btn px-5 py-3 font-pixel text-[10px]"
          onClick={() => {
            SFX.click();
            onClose();
          }}
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
}
