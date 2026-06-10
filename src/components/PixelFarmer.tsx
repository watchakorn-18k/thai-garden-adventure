import { useEffect, useRef } from "react";
import type { Direction, Tool } from "@/lib/game-types";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "@/lib/player-cosmetics";
import {
  ART_GRID,
  farmerRects,
  paletteFor,
  sideToolOverlay,
  verticalToolOverlay,
  type Rect,
} from "@/lib/pixel-art";
import { toolDurationMs, toolWaapiKeyframes } from "@/lib/tool-animation";

interface Props {
  direction: Direction;
  walking: boolean;
  walkFrame: number;
  acting: boolean;
  tool: Tool;
  cosmetics?: PlayerCosmetics;
}

function mirrorRect([x, y, w, h, color]: Rect): Rect {
  return [ART_GRID - x - w, y, w, h, color];
}

function Rects({ rects }: { rects: Rect[] }) {
  return (
    <>
      {rects.map(([x, y, w, h, color], index) => (
        <rect
          key={`${index}:${x}:${y}:${w}:${h}:${color}`}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={color}
        />
      ))}
    </>
  );
}

export default function PixelFarmer({
  direction,
  walking,
  walkFrame,
  acting,
  tool,
  cosmetics = DEFAULT_COSMETICS,
}: Props) {
  const swing = walking ? walkFrame % 2 : 0;
  const flip = direction === "left";
  const isVertical = direction === "up" || direction === "down";
  const palette = paletteFor(cosmetics);
  const bodyRects = farmerRects({ direction, swing, acting: false, tool, cosmetics }).map((rect) =>
    flip ? mirrorRect(rect) : rect,
  );
  const toolRects = (
    isVertical ? verticalToolOverlay(tool, palette) : sideToolOverlay(tool, palette)
  ).map((rect) => (flip ? mirrorRect(rect) : rect));

  const toolRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!acting || tool !== "hoe") return;
    const el = toolRef.current;
    if (!el) return;
    const anim = el.animate(toolWaapiKeyframes("hoe", isVertical), {
      duration: toolDurationMs("hoe"),
      easing: "linear",
      fill: "forwards",
    });
    return () => anim.cancel();
  }, [acting, tool, isVertical]);

  return (
    <svg
      viewBox="0 0 16 16"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        imageRendering: "pixelated",
        overflow: "visible",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
        animation: walking ? "pixel-bob 0.28s steps(2) infinite" : "none",
      }}
    >
      <Rects rects={bodyRects} />
      {acting && (
        <g
          ref={tool === "hoe" ? toolRef : undefined}
          className={
            tool === "watering_can"
              ? isVertical
                ? "tool-water-vertical"
                : "tool-water-side"
              : tool === "seed"
                ? isVertical
                  ? "tool-seed-vertical"
                  : "tool-seed-side"
                : undefined
          }
          style={{ transformOrigin: isVertical ? "8px 11px" : flip ? "6px 11px" : "10px 11px" }}
        >
          <Rects rects={toolRects} />
        </g>
      )}
    </svg>
  );
}
