import { useEffect, useRef } from "react";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "@/lib/player-cosmetics";
import { toolDurationMs, toolWaapiKeyframes } from "@/lib/tool-animation";

type Direction = "up" | "down" | "left" | "right";

interface Props {
  direction: Direction;
  walking: boolean;
  walkFrame: number;
  acting: boolean;
  tool: "hoe" | "watering_can" | "seed";
  cosmetics?: PlayerCosmetics;
}

function shade(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Pixel palette
const C = {
  hat: "#d9a441", // straw hat
  hatDark: "#8b6420",
  skin: "#f0c090",
  skinDark: "#c08858",
  shirt: "#c8412e", // Thai red
  shirtDark: "#7a2418",
  pants: "#3a5a8a",
  pantsDark: "#1f3560",
  shoe: "#2a1810",
  hair: "#1a0f08",
  outline: "#1a1208",
  tool: "#8b5a2b",
  toolMetal: "#9aa0a8",
  toolMetalDark: "#555a62",
  water: "#4cc2ee",
  seed: "#5a8a3a",
};

/** Each cell is a single pixel; the SVG is rendered at TILE size with crisp-edges. */
function FrontSprite({ swing, palette }: { swing: number; palette: typeof C }) {
  const leftForward = swing === 0;

  return (
    <>
      <rect x="2" y="3" width="12" height="1" fill={palette.hat} />
      <rect x="3" y="2" width="10" height="1" fill={palette.hat} />
      <rect x="2" y="4" width="12" height="1" fill={palette.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={palette.hat} />
      <rect x="6" y="0" width="4" height="1" fill={palette.hatDark} />
      <rect x="5" y="5" width="6" height="3" fill={palette.skin} />
      <rect x="5" y="8" width="6" height="1" fill={palette.skinDark} />
      <rect x="6" y="6" width="1" height="1" fill={palette.outline} />
      <rect x="9" y="6" width="1" height="1" fill={palette.outline} />
      <rect x="4" y="9" width="8" height="3" fill={palette.shirt} />
      <rect x="4" y="11" width="8" height="1" fill={palette.shirtDark} />
      <rect x="3" y={leftForward ? 10 : 9} width="1" height="3" fill={palette.skin} />
      <rect x="12" y={leftForward ? 9 : 10} width="1" height="3" fill={palette.skin} />
      <rect x="5" y="12" width="6" height="2" fill={palette.pants} />
      <rect x="5" y="13" width="6" height="1" fill={palette.pantsDark} />
      <rect x="5" y={leftForward ? 14 : 13} width="2" height="2" fill={palette.shoe} />
      <rect x="9" y={leftForward ? 13 : 14} width="2" height="2" fill={palette.shoe} />
    </>
  );
}

function BackSprite({ swing, palette }: { swing: number; palette: typeof C }) {
  const rightForward = swing === 0;

  return (
    <>
      <rect x="2" y="3" width="12" height="1" fill={palette.hat} />
      <rect x="3" y="2" width="10" height="1" fill={palette.hat} />
      <rect x="2" y="4" width="12" height="1" fill={palette.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={palette.hat} />
      <rect x="6" y="0" width="4" height="1" fill={palette.hatDark} />
      <rect x="5" y="5" width="6" height="3" fill={palette.hair} />
      <rect x="5" y="8" width="6" height="1" fill={palette.skinDark} />
      <rect x="4" y="9" width="8" height="3" fill={palette.shirtDark} />
      <rect x="3" y={rightForward ? 9 : 10} width="1" height="3" fill={palette.skinDark} />
      <rect x="12" y={rightForward ? 10 : 9} width="1" height="3" fill={palette.skinDark} />
      <rect x="5" y="12" width="6" height="2" fill={palette.pantsDark} />
      <rect x="5" y={rightForward ? 13 : 14} width="2" height="2" fill={palette.shoe} />
      <rect x="9" y={rightForward ? 14 : 13} width="2" height="2" fill={palette.shoe} />
    </>
  );
}

function SideSprite({ swing, palette }: { swing: number; palette: typeof C }) {
  return (
    <>
      <rect x="2" y="3" width="12" height="1" fill={palette.hat} />
      <rect x="3" y="2" width="10" height="1" fill={palette.hat} />
      <rect x="2" y="4" width="12" height="1" fill={palette.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={palette.hat} />
      <rect x="6" y="0" width="4" height="1" fill={palette.hatDark} />
      {/* Profile face */}
      <rect x="5" y="5" width="6" height="3" fill={palette.skin} />
      <rect x="10" y="6" width="1" height="1" fill={palette.outline} />
      <rect x="5" y="8" width="6" height="1" fill={palette.skinDark} />
      {/* Shirt */}
      <rect x="5" y="9" width="6" height="3" fill={palette.shirt} />
      <rect x="5" y="11" width="6" height="1" fill={palette.shirtDark} />
      {/* Arm in front */}
      <rect x="10" y="9" width="2" height="3" fill={palette.shirt} />
      {/* Pants */}
      <rect x="6" y="12" width="4" height="2" fill={palette.pants} />
      {/* Legs walking */}
      <rect x={swing === 0 ? 6 : 5} y="14" width="2" height="2" fill={palette.shoe} />
      <rect x={swing === 0 ? 8 : 9} y="14" width="2" height="2" fill={palette.shoe} />
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
  const palette = {
    ...C,
    hat: cosmetics.hat,
    hatDark: shade(cosmetics.hat, -70),
    shirt: cosmetics.shirt,
    shirtDark: shade(cosmetics.shirt, -70),
    pants: cosmetics.pants,
    pantsDark: shade(cosmetics.pants, -70),
  };

  // Drive the hoe swing from the shared motion module (single source for SP+MP)
  // via the Web Animations API, so the wind-up curve stays in sync with Phaser.
  const hoeRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!acting || tool !== "hoe") return;
    const el = hoeRef.current;
    if (!el) return;
    const anim = el.animate(toolWaapiKeyframes("hoe", isVertical), {
      duration: toolDurationMs("hoe"),
      easing: "linear",
      fill: "forwards",
    });
    return () => anim.cancel();
  }, [acting, tool, isVertical]);

  const sideToolOverlay = () => {
    if (!acting) return null;
    if (tool === "hoe") {
      return (
        <g ref={hoeRef} style={{ transformOrigin: "10px 11px" }}>
          <rect x="11" y="6" width="1" height="8" fill={palette.tool} />
          <rect x="12" y="7" width="1" height="7" fill={palette.tool} />
          <rect x="12" y="3" width="4" height="2" fill={palette.toolMetal} />
          <rect x="12" y="5" width="4" height="1" fill={palette.toolMetalDark} />
        </g>
      );
    }
    if (tool === "watering_can") {
      return (
        <g style={{ transformOrigin: "12px 10px" }} className="tool-water-side">
          <rect x="10" y="8" width="4" height="3" fill={palette.toolMetal} />
          <rect x="10" y="10" width="4" height="1" fill={palette.toolMetalDark} />
          <rect x="14" y="9" width="1" height="1" fill={palette.toolMetal} />
          <rect x="15" y="11" width="1" height="1" fill={palette.water} className="drop-a" />
          <rect x="14" y="13" width="1" height="1" fill={palette.water} className="drop-b" />
        </g>
      );
    }
    return (
      <g className="tool-seed-side">
        <rect x="12" y="7" width="1" height="1" fill={palette.seed} />
        <rect x="14" y="9" width="1" height="1" fill={palette.seed} />
        <rect x="13" y="11" width="1" height="1" fill={palette.seed} />
      </g>
    );
  };

  const verticalToolOverlay = () => {
    if (!acting) return null;
    if (tool === "hoe") {
      return (
        <g ref={hoeRef} style={{ transformOrigin: "8px 11px" }}>
          <rect x="7" y="6" width="2" height="8" fill={palette.tool} />
          <rect x="6" y="2" width="4" height="2" fill={palette.toolMetal} />
          <rect x="6" y="4" width="4" height="1" fill={palette.toolMetalDark} />
        </g>
      );
    }
    if (tool === "watering_can") {
      return (
        <g style={{ transformOrigin: "8px 10px" }} className="tool-water-vertical">
          <rect x="6" y="7" width="4" height="3" fill={palette.toolMetal} />
          <rect x="6" y="9" width="4" height="1" fill={palette.toolMetalDark} />
          <rect x="5" y="8" width="1" height="1" fill={palette.toolMetal} />
          <rect x="7" y="11" width="1" height="1" fill={palette.water} className="drop-a" />
          <rect x="9" y="12" width="1" height="1" fill={palette.water} className="drop-b" />
        </g>
      );
    }
    return (
      <g className="tool-seed-vertical">
        <rect x="7" y="10" width="1" height="1" fill={palette.seed} />
        <rect x="9" y="11" width="1" height="1" fill={palette.seed} />
        <rect x="8" y="13" width="1" height="1" fill={palette.seed} />
      </g>
    );
  };

  let body;
  if (direction === "down") body = <FrontSprite swing={swing} palette={palette} />;
  else if (direction === "up") body = <BackSprite swing={swing} palette={palette} />;
  else body = <SideSprite swing={swing} palette={palette} />;

  return (
    <svg
      viewBox="0 0 16 16"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        transform: flip ? "scaleX(-1)" : undefined,
        imageRendering: "pixelated",
        overflow: "visible",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
        animation: walking ? "pixel-bob 0.28s steps(2) infinite" : "none",
      }}
    >
      {body}
      {isVertical ? verticalToolOverlay() : sideToolOverlay()}
    </svg>
  );
}
