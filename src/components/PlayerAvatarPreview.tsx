import { useEffect, useState } from "react";
import PixelFarmer from "./PixelFarmer";
import { readCosmetics, type PlayerCosmetics } from "@/lib/player-cosmetics";

interface PlayerAvatarPreviewProps {
  cosmetics?: PlayerCosmetics;
  className?: string;
}

export default function PlayerAvatarPreview({ cosmetics, className }: PlayerAvatarPreviewProps) {
  const [storedCosmetics, setStoredCosmetics] = useState(() => cosmetics ?? readCosmetics());
  const currentCosmetics = cosmetics ?? storedCosmetics;

  useEffect(() => {
    if (cosmetics) {
      setStoredCosmetics(cosmetics);
      return;
    }
    const syncCosmetics = () => setStoredCosmetics(readCosmetics());
    syncCosmetics();
    window.addEventListener("tg:cosmetics", syncCosmetics);
    window.addEventListener("storage", syncCosmetics);
    return () => {
      window.removeEventListener("tg:cosmetics", syncCosmetics);
      window.removeEventListener("storage", syncCosmetics);
    };
  }, [cosmetics]);

  return (
    <span className={className} aria-hidden>
      <PixelFarmer
        key={`${currentCosmetics.hat}:${currentCosmetics.shirt}:${currentCosmetics.pants}`}
        direction="down"
        walking={false}
        walkFrame={0}
        acting={false}
        tool="hoe"
        cosmetics={currentCosmetics}
      />
    </span>
  );
}
