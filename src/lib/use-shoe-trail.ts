import { useCallback, useEffect, useRef, useState } from "react";
import { shoeTrailFootPoint, type ShoeTrailPoint } from "@/components/ShoeTrailOverlay";
import type { ShoeTrailId } from "@/lib/player-cosmetics";
import type { Direction } from "@/lib/game-types";

export function useShoeTrail(tile: number) {
  const foot = useRef<0 | 1>(0);
  const [shoeTrailPath, setShoeTrailPath] = useState<{
    kind: Exclude<ShoeTrailId, "none">;
    points: ShoeTrailPoint[];
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      setShoeTrailPath((current) => {
        if (!current) return null;
        const points = current.points.filter((p) => now - p.t < 1350);
        return points.length >= 2 ? { ...current, points } : null;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const addShoeTrailPoint = useCallback(
    (kind: ShoeTrailId, x: number, y: number, dir: Direction, now: number) => {
      if (kind === "none") return;
      const f = foot.current;
      foot.current = f === 0 ? 1 : 0;
      const point = shoeTrailFootPoint(x, y, dir, f, tile);
      const tp = { ...point, t: now, foot: f };
      setShoeTrailPath((current) => {
        const recent = current?.kind === kind ? current.points.filter((p) => now - p.t < 1350) : [];
        const last = recent[recent.length - 1];
        if (last && Math.hypot(last.x - tp.x, last.y - tp.y) < 8) return current;
        return { kind, points: [...recent, tp].slice(-34) };
      });
    },
    [tile],
  );

  const trimTrailOnStop = useCallback(() => {
    setShoeTrailPath((current) =>
      current ? { ...current, points: current.points.slice(-10) } : null,
    );
  }, []);

  return { shoeTrailPath, addShoeTrailPoint, trimTrailOnStop };
}
