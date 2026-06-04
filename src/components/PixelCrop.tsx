type CropId = "chili" | "rice" | "morning_glory" | "eggplant";

interface Props {
  id: CropId;
  stage: number; // 0 sprout, 1 mid, 2 ripe, 3 withered
}

const SOIL = "#3a2010";

function Withered() {
  return (
    <>
      <rect x="5" y="14" width="6" height="1" fill={SOIL} />
      {/* dead stem */}
      <rect x="7" y="11" width="2" height="3" fill="#5c4033" />
      <rect x="6" y="12" width="1" height="2" fill="#5c4033" />
      <rect x="9" y="12" width="1" height="2" fill="#5c4033" />
      {/* drooping brown leaves */}
      <rect x="4" y="13" width="2" height="1" fill="#4a3525" />
      <rect x="10" y="13" width="2" height="1" fill="#4a3525" />
      <rect x="6" y="10" width="4" height="1" fill="#4a3525" />
    </>
  );
}

function Sprout() {
  return (
    <>
      <rect x="7" y="11" width="2" height="3" fill="#3a6b2a" />
      <rect x="6" y="10" width="1" height="2" fill="#5fa148" />
      <rect x="9" y="10" width="1" height="2" fill="#5fa148" />
      <rect x="7" y="9" width="2" height="2" fill="#8bc967" />
      <rect x="6" y="14" width="4" height="1" fill={SOIL} />
    </>
  );
}

function Mid({ color }: { color: string }) {
  return (
    <>
      <rect x="7" y="9" width="2" height="5" fill="#3a6b2a" />
      <rect x="5" y="8" width="2" height="2" fill={color} />
      <rect x="9" y="8" width="2" height="2" fill={color} />
      <rect x="6" y="6" width="4" height="2" fill={color} />
      <rect x="6" y="14" width="4" height="1" fill={SOIL} />
    </>
  );
}

function Chili() {
  return (
    <>
      {/* stem */}
      <rect x="7" y="10" width="2" height="3" fill="#3a6b2a" />
      <rect x="5" y="9" width="2" height="1" fill="#5fa148" />
      <rect x="9" y="9" width="2" height="1" fill="#5fa148" />
      {/* leaves */}
      <rect x="4" y="8" width="2" height="2" fill="#4e8c3a" />
      <rect x="10" y="8" width="2" height="2" fill="#4e8c3a" />
      {/* chili 1 hanging */}
      <rect x="3" y="10" width="1" height="1" fill="#3a6b2a" />
      <rect x="3" y="11" width="2" height="1" fill="#d92e2e" />
      <rect x="2" y="12" width="2" height="2" fill="#e84444" />
      <rect x="2" y="14" width="1" height="1" fill="#a01818" />
      {/* chili 2 */}
      <rect x="12" y="10" width="1" height="1" fill="#3a6b2a" />
      <rect x="11" y="11" width="2" height="1" fill="#d92e2e" />
      <rect x="12" y="12" width="2" height="2" fill="#e84444" />
      <rect x="13" y="14" width="1" height="1" fill="#a01818" />
      {/* top chili */}
      <rect x="7" y="6" width="2" height="1" fill="#3a6b2a" />
      <rect x="7" y="7" width="2" height="2" fill="#e84444" />
      <rect x="7" y="9" width="2" height="1" fill="#a01818" />
      <rect x="6" y="14" width="4" height="1" fill={SOIL} />
    </>
  );
}

function Rice() {
  // golden tall stalks
  return (
    <>
      <rect x="5" y="14" width="6" height="1" fill={SOIL} />
      {/* stalks */}
      <rect x="5" y="9" width="1" height="5" fill="#7a9a3a" />
      <rect x="7" y="7" width="1" height="7" fill="#7a9a3a" />
      <rect x="10" y="9" width="1" height="5" fill="#7a9a3a" />
      {/* grain heads */}
      <rect x="4" y="6" width="3" height="2" fill="#e8c454" />
      <rect x="4" y="7" width="3" height="1" fill="#c89a30" />
      <rect x="6" y="4" width="3" height="2" fill="#f4d864" />
      <rect x="6" y="5" width="3" height="1" fill="#c89a30" />
      <rect x="9" y="6" width="3" height="2" fill="#e8c454" />
      <rect x="9" y="7" width="3" height="1" fill="#c89a30" />
      {/* whiskers */}
      <rect x="5" y="3" width="1" height="1" fill="#f4d864" />
      <rect x="9" y="3" width="1" height="1" fill="#f4d864" />
      <rect x="7" y="2" width="1" height="1" fill="#f4d864" />
    </>
  );
}

function MorningGlory() {
  // leafy green water spinach
  return (
    <>
      <rect x="5" y="14" width="6" height="1" fill={SOIL} />
      {/* stems */}
      <rect x="7" y="9" width="1" height="5" fill="#3a6b2a" />
      <rect x="8" y="9" width="1" height="5" fill="#3a6b2a" />
      {/* big leaves */}
      <rect x="4" y="7" width="3" height="3" fill="#5fa148" />
      <rect x="3" y="8" width="1" height="2" fill="#4e8c3a" />
      <rect x="4" y="8" width="2" height="1" fill="#8bc967" />
      <rect x="9" y="7" width="3" height="3" fill="#5fa148" />
      <rect x="12" y="8" width="1" height="2" fill="#4e8c3a" />
      <rect x="10" y="8" width="2" height="1" fill="#8bc967" />
      <rect x="6" y="5" width="4" height="3" fill="#6ab04c" />
      <rect x="6" y="6" width="2" height="1" fill="#8bc967" />
      <rect x="6" y="4" width="2" height="1" fill="#5fa148" />
      <rect x="8" y="4" width="2" height="1" fill="#5fa148" />
      {/* tiny purple flower */}
      <rect x="9" y="3" width="2" height="2" fill="#9b59d4" />
      <rect x="10" y="4" width="1" height="1" fill="#fff" />
    </>
  );
}

function Eggplant() {
  return (
    <>
      <rect x="5" y="14" width="6" height="1" fill={SOIL} />
      {/* stalk */}
      <rect x="7" y="9" width="2" height="5" fill="#3a6b2a" />
      {/* leaves */}
      <rect x="4" y="8" width="3" height="2" fill="#5fa148" />
      <rect x="9" y="8" width="3" height="2" fill="#5fa148" />
      <rect x="6" y="6" width="4" height="2" fill="#6ab04c" />
      {/* eggplant 1 */}
      <rect x="3" y="10" width="1" height="1" fill="#5fa148" />
      <rect x="2" y="11" width="3" height="3" fill="#6b2e94" />
      <rect x="2" y="11" width="3" height="1" fill="#8b4ec0" />
      <rect x="3" y="13" width="2" height="1" fill="#4a1e6b" />
      {/* eggplant 2 (bigger center) */}
      <rect x="6" y="9" width="1" height="1" fill="#5fa148" />
      <rect x="9" y="9" width="1" height="1" fill="#5fa148" />
      <rect x="6" y="10" width="4" height="4" fill="#6b2e94" />
      <rect x="6" y="10" width="4" height="1" fill="#8b4ec0" />
      <rect x="6" y="13" width="4" height="1" fill="#4a1e6b" />
      <rect x="7" y="11" width="1" height="1" fill="#8b4ec0" />
    </>
  );
}

export default function PixelCrop({ id, stage }: Props) {
  let body;
  if (stage === 0) body = <Sprout />;
  else if (stage === 1) {
    const color =
      id === "chili"
        ? "#5fa148"
        : id === "rice"
          ? "#9bb84a"
          : id === "morning_glory"
            ? "#6ab04c"
            : "#5fa148";
    body = <Mid color={color} />;
  } else if (stage === 2) {
    if (id === "chili") body = <Chili />;
    else if (id === "rice") body = <Rice />;
    else if (id === "morning_glory") body = <MorningGlory />;
    else body = <Eggplant />;
  } else {
    body = <Withered />;
  }

  return (
    <svg
      viewBox="0 0 16 16"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        imageRendering: "pixelated",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.4))",
      }}
    >
      {body}
    </svg>
  );
}
