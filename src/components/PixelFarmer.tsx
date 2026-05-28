type Direction = "up" | "down" | "left" | "right";

interface Props {
  direction: Direction;
  walking: boolean;
  walkFrame: number;
  acting: boolean;
  tool: "hoe" | "watering_can" | "seed";
}

// Pixel palette
const C = {
  hat: "#d9a441",      // straw hat
  hatDark: "#8b6420",
  skin: "#f0c090",
  skinDark: "#c08858",
  shirt: "#c8412e",    // Thai red
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
function FrontSprite({ swing }: { swing: number }) {
  // 16x16 grid expressed as JSX rects
  // We'll draw a small farmer with the hat (ngob)
  return (
    <>
      {/* Hat brim wide */}
      <rect x="2" y="3" width="12" height="1" fill={C.hat} />
      <rect x="3" y="2" width="10" height="1" fill={C.hat} />
      <rect x="2" y="4" width="12" height="1" fill={C.hatDark} />
      {/* Hat cone */}
      <rect x="5" y="1" width="6" height="1" fill={C.hat} />
      <rect x="6" y="0" width="4" height="1" fill={C.hatDark} />
      {/* Face */}
      <rect x="5" y="5" width="6" height="3" fill={C.skin} />
      <rect x="5" y="8" width="6" height="1" fill={C.skinDark} />
      {/* Eyes */}
      <rect x="6" y="6" width="1" height="1" fill={C.outline} />
      <rect x="9" y="6" width="1" height="1" fill={C.outline} />
      {/* Shirt */}
      <rect x="4" y="9" width="8" height="3" fill={C.shirt} />
      <rect x="4" y="11" width="8" height="1" fill={C.shirtDark} />
      {/* Arms */}
      <rect x="3" y="9" width="1" height="3" fill={C.skin} />
      <rect x="12" y="9" width="1" height="3" fill={C.skin} />
      {/* Pants */}
      <rect x="5" y="12" width="6" height="2" fill={C.pants} />
      <rect x="5" y="13" width="6" height="1" fill={C.pantsDark} />
      {/* Legs animation */}
      <rect x={swing === 0 ? 5 : 4} y="14" width="2" height="2" fill={C.shoe} />
      <rect x={swing === 0 ? 9 : 10} y="14" width="2" height="2" fill={C.shoe} />
    </>
  );
}

function BackSprite({ swing }: { swing: number }) {
  return (
    <>
      <rect x="2" y="3" width="12" height="1" fill={C.hat} />
      <rect x="3" y="2" width="10" height="1" fill={C.hat} />
      <rect x="2" y="4" width="12" height="1" fill={C.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={C.hat} />
      <rect x="6" y="0" width="4" height="1" fill={C.hatDark} />
      {/* Back of head */}
      <rect x="5" y="5" width="6" height="3" fill={C.hair} />
      <rect x="5" y="8" width="6" height="1" fill={C.skinDark} />
      {/* Shirt back */}
      <rect x="4" y="9" width="8" height="3" fill={C.shirtDark} />
      <rect x="3" y="9" width="1" height="3" fill={C.skin} />
      <rect x="12" y="9" width="1" height="3" fill={C.skin} />
      <rect x="5" y="12" width="6" height="2" fill={C.pantsDark} />
      <rect x={swing === 0 ? 5 : 4} y="14" width="2" height="2" fill={C.shoe} />
      <rect x={swing === 0 ? 9 : 10} y="14" width="2" height="2" fill={C.shoe} />
    </>
  );
}

function SideSprite({ swing }: { swing: number }) {
  return (
    <>
      <rect x="2" y="3" width="12" height="1" fill={C.hat} />
      <rect x="3" y="2" width="10" height="1" fill={C.hat} />
      <rect x="2" y="4" width="12" height="1" fill={C.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={C.hat} />
      <rect x="6" y="0" width="4" height="1" fill={C.hatDark} />
      {/* Profile face */}
      <rect x="5" y="5" width="6" height="3" fill={C.skin} />
      <rect x="10" y="6" width="1" height="1" fill={C.outline} />
      <rect x="5" y="8" width="6" height="1" fill={C.skinDark} />
      {/* Shirt */}
      <rect x="5" y="9" width="6" height="3" fill={C.shirt} />
      <rect x="5" y="11" width="6" height="1" fill={C.shirtDark} />
      {/* Arm in front */}
      <rect x="10" y="9" width="2" height="3" fill={C.shirt} />
      {/* Pants */}
      <rect x="6" y="12" width="4" height="2" fill={C.pants} />
      {/* Legs walking */}
      <rect x={swing === 0 ? 6 : 5} y="14" width="2" height="2" fill={C.shoe} />
      <rect x={swing === 0 ? 8 : 9} y="14" width="2" height="2" fill={C.shoe} />
    </>
  );
}

export default function PixelFarmer({ direction, walking, walkFrame, acting, tool }: Props) {
  const swing = walking ? walkFrame % 2 : 0;
  const flip = direction === "left";
  const isVertical = direction === "up" || direction === "down";

  // Tool overlay placement & rotation based on direction + acting state
  const toolOverlay = () => {
    if (!acting) return null;
    if (tool === "hoe") {
      // Pixel hoe: handle (brown) + head (metal)
      return (
        <g className="tool-swing-side" style={{ transformOrigin: "11px 9px" }}>
          <rect x="11" y="3" width="1" height="7" fill={C.tool} />
          <rect x="12" y="2" width="1" height="6" fill={C.tool} />
          <rect x="10" y="9" width="3" height="2" fill={C.toolMetal} />
          <rect x="10" y="11" width="3" height="1" fill={C.toolMetalDark} />
        </g>
      );
    }
    if (tool === "watering_can") {
      return (
        <g style={{ transformOrigin: "12px 10px" }} className="tool-tilt">
          <rect x="11" y="8" width="3" height="3" fill={C.toolMetal} />
          <rect x="11" y="10" width="3" height="1" fill={C.toolMetalDark} />
          <rect x="14" y="9" width="1" height="1" fill={C.toolMetal} />
          {/* water drops */}
          <rect x="15" y="11" width="1" height="1" fill={C.water} className="drop-a" />
          <rect x="14" y="13" width="1" height="1" fill={C.water} className="drop-b" />
        </g>
      );
    }
    // seed
    return (
      <g className="seed-toss">
        <rect x="13" y="6" width="1" height="1" fill={C.seed} />
        <rect x="14" y="8" width="1" height="1" fill={C.seed} />
        <rect x="13" y="10" width="1" height="1" fill={C.seed} />
      </g>
    );
  };

  let body;
  if (direction === "down") body = <FrontSprite swing={swing} />;
  else if (direction === "up") body = <BackSprite swing={swing} />;
  else body = <SideSprite swing={swing} />;

  return (
    <svg
      viewBox="0 0 16 16"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        transform: flip ? "scaleX(-1)" : undefined,
        imageRendering: "pixelated",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
        animation: walking ? "pixel-bob 0.28s steps(2) infinite" : "none",
      }}
    >
      {body}
      {/* Tool overlay — for vertical directions only show when not in seed mode if you want, but ok */}
      {!isVertical && toolOverlay()}
      {isVertical && acting && (
        <g style={{ transformOrigin: "8px 9px" }} className="tool-vertical">
          {tool === "hoe" && (
            <>
              <rect x="7" y="2" width="2" height="7" fill={C.tool} />
              <rect x="6" y="9" width="4" height="2" fill={C.toolMetal} />
            </>
          )}
          {tool === "watering_can" && (
            <>
              <rect x="6" y="7" width="4" height="3" fill={C.toolMetal} />
              <rect x="7" y="11" width="1" height="1" fill={C.water} className="drop-a" />
              <rect x="9" y="12" width="1" height="1" fill={C.water} className="drop-b" />
            </>
          )}
          {tool === "seed" && (
            <>
              <rect x="7" y="10" width="1" height="1" fill={C.seed} />
              <rect x="9" y="11" width="1" height="1" fill={C.seed} />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
