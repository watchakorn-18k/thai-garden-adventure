export interface ShoeTrailPoint {
  x: number;
  y: number;
  t: number;
  foot: 0 | 1;
}

export function trailSegmentPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} Q ${a.x} ${a.y} ${mx} ${my} T ${b.x} ${b.y}`;
}

export function smoothTrailPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    const midY = (prev.y + current.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

export function shoeTrailFootPoint(
  x: number,
  y: number,
  dir: "up" | "down" | "left" | "right",
  foot: 0 | 1,
  tile: number,
): { x: number; y: number } {
  const side = foot === 0 ? -1 : 1;
  const sideX = dir === "up" || dir === "down" ? side * 7 : 0;
  const sideY = dir === "left" || dir === "right" ? side * 5 : 0;
  const footX = (dir === "right" ? 17 : dir === "left" ? -17 : 0) + sideX;
  const footY = (dir === "down" ? 24 : dir === "up" ? 4 : 22) + sideY;
  return { x: x * tile + tile / 2 + footX, y: y * tile + footY };
}
