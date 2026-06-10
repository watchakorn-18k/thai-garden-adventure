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

const AURA_PARTICLES = [
  { x: 8, y: 8, path: "0 0; -2 -3; -7 -5; -11 -3", dur: 1.35, delay: 0 },
  { x: 8, y: 8, path: "0 0; 3 -2; 8 -8; 12 -6", dur: 1.55, delay: 0.16 },
  { x: 8, y: 8, path: "0 0; -1 4; -6 8; -4 12", dur: 1.28, delay: 0.32 },
  { x: 8, y: 8, path: "0 0; 4 2; 8 6; 6 11", dur: 1.42, delay: 0.48 },
  { x: 8, y: 8, path: "0 0; 1 -4; -2 -10; 1 -14", dur: 1.7, delay: 0.64 },
  { x: 8, y: 8, path: "0 0; -4 1; -12 3; -15 0", dur: 1.48, delay: 0.8 },
  { x: 8, y: 8, path: "0 0; 5 -1; 12 2; 15 -2", dur: 1.32, delay: 0.96 },
  { x: 8, y: 8, path: "0 0; 1 4; 4 11; 1 15", dur: 1.62, delay: 1.12 },
] as const;

function auraColors(aura: PlayerCosmetics["aura"]): string[] {
  if (aura === "gold") return ["#ffd24a", "#fff5b8", "#f0a05b"];
  if (aura === "spark") return ["#7fd8ff", "#f4e4c1", "#c08bd9"];
  if (aura === "rainbow") return ["#d94e6a", "#ffd24a", "#7fd8ff", "#8bc967", "#c08bd9"];
  return [];
}

function AuraEffect({ aura }: { aura: PlayerCosmetics["aura"] }) {
  const colors = auraColors(aura);
  if (!colors.length) return null;
  return (
    <g className={`farmer-aura farmer-aura-${aura}`}>
      {AURA_PARTICLES.map((p, index) => {
        const color = colors[index % colors.length];
        return (
          <g key={`${aura}-${index}`} opacity="0">
            <animateTransform
              attributeName="transform"
              type="translate"
              values={p.path}
              keyTimes="0;0.28;0.72;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.2 0.9 0.2 1; 0.25 0.8 0.25 1; 0.2 0 0.2 1"
            />
            <animate
              attributeName="opacity"
              values="0;1;0.9;0"
              keyTimes="0;0.16;0.68;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.2 0.9 0.2 1; 0.25 0.8 0.25 1; 0.2 0 0.2 1"
            />
            <rect x={p.x} y={p.y} width="1" height="1" fill={color} />
          </g>
        );
      })}
    </g>
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
  const bodyRects = farmerRects({
    direction,
    swing,
    acting: false,
    tool,
    cosmetics: { ...cosmetics, aura: "none" },
  }).map((rect) => (flip ? mirrorRect(rect) : rect));
  const toolRects = (
    isVertical ? verticalToolOverlay(tool, palette, direction) : sideToolOverlay(tool, palette)
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

  const toolNode = acting ? (
    <g
      ref={tool === "hoe" ? toolRef : undefined}
      className={
        tool === "watering_can"
          ? isVertical
            ? undefined
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
  ) : null;
  const toolBehindBody = direction === "up" && tool === "watering_can";

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
      <AuraEffect aura={cosmetics.aura} />
      {toolBehindBody && toolNode}
      <Rects rects={bodyRects} />
      {!toolBehindBody && toolNode}
    </svg>
  );
}
