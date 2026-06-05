interface IconProps {
  size?: number;
}

const wrap = (size: number, body: React.ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    style={{ imageRendering: "pixelated" }}
  >
    {body}
  </svg>
);

export function HelpBookIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="3" y="3" width="10" height="10" fill="#1a0f1f" />
      <rect x="4" y="2" width="8" height="1" fill="#f4e4c1" />
      <rect x="4" y="3" width="8" height="9" fill="#f4e4c1" />
      <rect x="11" y="4" width="1" height="8" fill="#c8a878" />
      <rect x="5" y="4" width="5" height="1" fill="#8b6420" />
      <rect x="5" y="6" width="6" height="1" fill="#2d1b3d" />
      <rect x="5" y="8" width="4" height="1" fill="#2d1b3d" />
      <rect x="8" y="10" width="1" height="1" fill="#d94e6a" />
      <rect x="9" y="9" width="1" height="1" fill="#d94e6a" />
      <rect x="10" y="8" width="1" height="1" fill="#d94e6a" />
      <rect x="10" y="6" width="1" height="2" fill="#d94e6a" />
      <rect x="8" y="5" width="2" height="1" fill="#d94e6a" />
      <rect x="7" y="6" width="1" height="1" fill="#d94e6a" />
      <rect x="8" y="12" width="1" height="1" fill="#ffd24a" />
    </>,
  );
}

export function SpeakerOnIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* speaker body + cone */}
      <rect x="3" y="6" width="2" height="4" fill="#4a2f5c" />
      <rect x="5" y="5" width="1" height="6" fill="#f4e4c1" />
      <rect x="6" y="4" width="1" height="8" fill="#f4e4c1" />
      <rect x="7" y="3" width="1" height="10" fill="#f4e4c1" />
      {/* sound waves */}
      <rect x="9" y="6" width="1" height="1" fill="#ffd24a" />
      <rect x="9" y="9" width="1" height="1" fill="#ffd24a" />
      <rect x="10" y="7" width="1" height="2" fill="#ffd24a" />
      <rect x="11" y="4" width="1" height="2" fill="#e8a23a" />
      <rect x="11" y="10" width="1" height="2" fill="#e8a23a" />
      <rect x="12" y="6" width="1" height="4" fill="#e8a23a" />
    </>,
  );
}

export function SpeakerOffIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* speaker body + cone */}
      <rect x="3" y="6" width="2" height="4" fill="#4a2f5c" />
      <rect x="5" y="5" width="1" height="6" fill="#b89dd1" />
      <rect x="6" y="4" width="1" height="8" fill="#b89dd1" />
      <rect x="7" y="3" width="1" height="10" fill="#b89dd1" />
      {/* mute cross */}
      <rect x="9" y="5" width="1" height="1" fill="#d94e6a" />
      <rect x="10" y="6" width="1" height="1" fill="#d94e6a" />
      <rect x="11" y="7" width="1" height="1" fill="#d94e6a" />
      <rect x="12" y="8" width="1" height="1" fill="#d94e6a" />
      <rect x="12" y="5" width="1" height="1" fill="#d94e6a" />
      <rect x="11" y="6" width="1" height="1" fill="#d94e6a" />
      <rect x="9" y="8" width="1" height="1" fill="#d94e6a" />
      <rect x="10" y="7" width="1" height="1" fill="#d94e6a" />
    </>,
  );
}

export function HoeIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="3" y="11" width="1" height="1" fill="#1a0f08" />
      <rect x="4" y="10" width="1" height="1" fill="#1a0f08" />
      <rect x="5" y="9" width="1" height="1" fill="#1a0f08" />
      <rect x="6" y="8" width="1" height="1" fill="#1a0f08" />
      <rect x="7" y="7" width="1" height="1" fill="#1a0f08" />
      <rect x="8" y="6" width="1" height="1" fill="#1a0f08" />
      <rect x="9" y="5" width="1" height="1" fill="#1a0f08" />
      {/* handle */}
      <rect x="4" y="12" width="1" height="1" fill="#8b5a2b" />
      <rect x="5" y="10" width="1" height="2" fill="#8b5a2b" />
      <rect x="6" y="9" width="1" height="2" fill="#8b5a2b" />
      <rect x="7" y="8" width="1" height="2" fill="#a36d36" />
      <rect x="8" y="7" width="1" height="2" fill="#8b5a2b" />
      <rect x="9" y="6" width="1" height="2" fill="#8b5a2b" />
      {/* head */}
      <rect x="10" y="5" width="3" height="1" fill="#cdd2d8" />
      <rect x="10" y="6" width="3" height="2" fill="#9aa0a8" />
      <rect x="10" y="8" width="3" height="1" fill="#555a62" />
    </>,
  );
}

export function WaterCanIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* body */}
      <rect x="4" y="6" width="6" height="6" fill="#9aa0a8" />
      <rect x="4" y="6" width="6" height="1" fill="#cdd2d8" />
      <rect x="4" y="11" width="6" height="1" fill="#555a62" />
      <rect x="3" y="7" width="1" height="4" fill="#9aa0a8" />
      <rect x="10" y="7" width="1" height="4" fill="#9aa0a8" />
      {/* handle */}
      <rect x="5" y="4" width="4" height="1" fill="#9aa0a8" />
      <rect x="5" y="5" width="1" height="1" fill="#9aa0a8" />
      <rect x="8" y="5" width="1" height="1" fill="#9aa0a8" />
      {/* spout */}
      <rect x="11" y="7" width="2" height="1" fill="#9aa0a8" />
      <rect x="13" y="6" width="1" height="2" fill="#9aa0a8" />
      {/* drops */}
      <rect x="14" y="9" width="1" height="1" fill="#4cc2ee" />
      <rect x="13" y="11" width="1" height="1" fill="#7fd8ff" />
      <rect x="14" y="13" width="1" height="1" fill="#4cc2ee" />
    </>,
  );
}

export function SeedIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* bag */}
      <rect x="4" y="5" width="8" height="9" fill="#8b6420" />
      <rect x="4" y="5" width="8" height="1" fill="#a8803a" />
      <rect x="4" y="13" width="8" height="1" fill="#5a3f12" />
      <rect x="5" y="4" width="6" height="1" fill="#5a3f12" />
      <rect x="6" y="3" width="4" height="1" fill="#5a3f12" />
      {/* label */}
      <rect x="6" y="8" width="4" height="3" fill="#f0d68a" />
      <rect x="7" y="9" width="1" height="1" fill="#3a6b2a" />
      <rect x="8" y="9" width="1" height="1" fill="#3a6b2a" />
      <rect x="7" y="10" width="2" height="1" fill="#5fa148" />
    </>,
  );
}

export function CoinIcon({ size = 16 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="5" y="2" width="6" height="1" fill="#c89a30" />
      <rect x="3" y="3" width="2" height="1" fill="#c89a30" />
      <rect x="11" y="3" width="2" height="1" fill="#c89a30" />
      <rect x="2" y="4" width="1" height="8" fill="#c89a30" />
      <rect x="13" y="4" width="1" height="8" fill="#c89a30" />
      <rect x="3" y="12" width="2" height="1" fill="#c89a30" />
      <rect x="11" y="12" width="2" height="1" fill="#c89a30" />
      <rect x="5" y="13" width="6" height="1" fill="#c89a30" />
      <rect x="3" y="4" width="10" height="8" fill="#f4d864" />
      <rect x="3" y="4" width="10" height="2" fill="#fbe89a" />
      <rect x="3" y="10" width="10" height="2" fill="#c89a30" />
      <rect x="6" y="6" width="4" height="1" fill="#a87a20" />
      <rect x="7" y="7" width="2" height="3" fill="#a87a20" />
      <rect x="6" y="9" width="4" height="1" fill="#a87a20" />
    </>,
  );
}

export function MoonIcon({ size = 16 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="6" y="2" width="5" height="1" fill="#fbd28a" />
      <rect x="4" y="3" width="2" height="1" fill="#fbd28a" />
      <rect x="11" y="3" width="2" height="1" fill="#fbd28a" />
      <rect x="3" y="4" width="2" height="2" fill="#fbd28a" />
      <rect x="3" y="6" width="2" height="4" fill="#fbd28a" />
      <rect x="3" y="10" width="2" height="2" fill="#fbd28a" />
      <rect x="4" y="12" width="2" height="1" fill="#fbd28a" />
      <rect x="6" y="13" width="5" height="1" fill="#fbd28a" />
      <rect x="11" y="12" width="2" height="1" fill="#fbd28a" />
      <rect x="9" y="3" width="2" height="2" fill="#c8946a" />
      <rect x="11" y="5" width="2" height="2" fill="#c8946a" />
      <rect x="6" y="7" width="2" height="2" fill="#c8946a" />
    </>,
  );
}

// crop thumbnails (16x16)
export function ChiliIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="7" y="3" width="3" height="1" fill="#3a6b2a" />
      <rect x="6" y="4" width="2" height="1" fill="#5fa148" />
      <rect x="8" y="4" width="1" height="2" fill="#3a6b2a" />
      <rect x="6" y="5" width="3" height="2" fill="#e84444" />
      <rect x="7" y="7" width="4" height="3" fill="#e84444" />
      <rect x="8" y="10" width="4" height="3" fill="#e84444" />
      <rect x="10" y="13" width="3" height="1" fill="#a01818" />
      <rect x="6" y="5" width="1" height="3" fill="#f06868" />
      <rect x="7" y="7" width="1" height="2" fill="#f06868" />
    </>,
  );
}

export function RiceIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="7" y="12" width="2" height="2" fill="#7a9a3a" />
      <rect x="5" y="6" width="2" height="2" fill="#f4d864" />
      <rect x="9" y="6" width="2" height="2" fill="#f4d864" />
      <rect x="7" y="4" width="2" height="2" fill="#f4d864" />
      <rect x="6" y="8" width="1" height="4" fill="#7a9a3a" />
      <rect x="9" y="8" width="1" height="4" fill="#7a9a3a" />
      <rect x="7" y="6" width="2" height="6" fill="#7a9a3a" />
      <rect x="5" y="7" width="2" height="1" fill="#c89a30" />
      <rect x="9" y="7" width="2" height="1" fill="#c89a30" />
      <rect x="7" y="5" width="2" height="1" fill="#c89a30" />
    </>,
  );
}

export function MorningGloryIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="3" y="6" width="4" height="3" fill="#5fa148" />
      <rect x="9" y="6" width="4" height="3" fill="#5fa148" />
      <rect x="6" y="3" width="4" height="3" fill="#6ab04c" />
      <rect x="3" y="6" width="2" height="1" fill="#8bc967" />
      <rect x="9" y="6" width="2" height="1" fill="#8bc967" />
      <rect x="6" y="3" width="2" height="1" fill="#8bc967" />
      <rect x="7" y="9" width="2" height="4" fill="#3a6b2a" />
      <rect x="10" y="2" width="2" height="2" fill="#9b59d4" />
      <rect x="11" y="3" width="1" height="1" fill="#fff" />
    </>,
  );
}

export function EggplantIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      <rect x="7" y="2" width="3" height="2" fill="#5fa148" />
      <rect x="6" y="3" width="1" height="1" fill="#5fa148" />
      <rect x="10" y="3" width="1" height="1" fill="#5fa148" />
      <rect x="5" y="4" width="7" height="8" fill="#6b2e94" />
      <rect x="5" y="4" width="7" height="1" fill="#8b4ec0" />
      <rect x="5" y="12" width="7" height="1" fill="#4a1e6b" />
      <rect x="5" y="13" width="2" height="1" fill="#4a1e6b" />
      <rect x="10" y="13" width="2" height="1" fill="#4a1e6b" />
      <rect x="6" y="6" width="1" height="2" fill="#8b4ec0" />
    </>,
  );
}

export function MangoIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* stem + leaf */}
      <rect x="8" y="2" width="1" height="2" fill="#3a6b2a" />
      <rect x="9" y="2" width="2" height="1" fill="#5fa148" />
      {/* mango body */}
      <rect x="5" y="4" width="7" height="2" fill="#f4d864" />
      <rect x="4" y="6" width="9" height="5" fill="#f4a824" />
      <rect x="4" y="6" width="9" height="1" fill="#f4d864" />
      <rect x="5" y="11" width="7" height="2" fill="#e88c14" />
      <rect x="6" y="13" width="5" height="1" fill="#c87010" />
      {/* highlight */}
      <rect x="5" y="7" width="2" height="2" fill="#fbe07a" />
    </>,
  );
}

export function LemongrassIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* stalks */}
      <rect x="6" y="4" width="1" height="10" fill="#6ab04c" />
      <rect x="8" y="3" width="1" height="11" fill="#8bc967" />
      <rect x="10" y="5" width="1" height="9" fill="#6ab04c" />
      {/* blades */}
      <rect x="4" y="6" width="3" height="1" fill="#5fa148" />
      <rect x="3" y="7" width="2" height="1" fill="#4e8c3a" />
      <rect x="9" y="5" width="3" height="1" fill="#5fa148" />
      <rect x="11" y="6" width="2" height="1" fill="#4e8c3a" />
      {/* base */}
      <rect x="5" y="13" width="6" height="1" fill="#3a6b2a" />
      <rect x="6" y="14" width="4" height="1" fill="#2a4a1e" />
    </>,
  );
}

export function PapayaIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* crown leaves */}
      <rect x="5" y="2" width="2" height="2" fill="#5fa148" />
      <rect x="9" y="2" width="2" height="2" fill="#5fa148" />
      <rect x="7" y="1" width="2" height="2" fill="#6ab04c" />
      {/* stem */}
      <rect x="7" y="3" width="2" height="2" fill="#3a6b2a" />
      {/* papaya body */}
      <rect x="5" y="5" width="6" height="2" fill="#f4a030" />
      <rect x="4" y="7" width="8" height="5" fill="#f47820" />
      <rect x="4" y="7" width="8" height="1" fill="#f4c060" />
      <rect x="5" y="12" width="6" height="2" fill="#d05810" />
      {/* highlight */}
      <rect x="5" y="8" width="2" height="2" fill="#f8d080" />
    </>,
  );
}

export function BasilIcon({ size = 24 }: IconProps) {
  return wrap(
    size,
    <>
      {/* stem */}
      <rect x="7" y="10" width="2" height="4" fill="#3a6b2a" />
      {/* leaves */}
      <rect x="4" y="7" width="4" height="4" fill="#5fa148" />
      <rect x="4" y="7" width="4" height="1" fill="#8bc967" />
      <rect x="8" y="7" width="4" height="4" fill="#5fa148" />
      <rect x="8" y="7" width="4" height="1" fill="#8bc967" />
      <rect x="5" y="4" width="6" height="4" fill="#6ab04c" />
      <rect x="5" y="4" width="6" height="1" fill="#8bc967" />
      {/* tiny purple flowers at tip */}
      <rect x="7" y="2" width="2" height="2" fill="#9b59d4" />
      <rect x="8" y="3" width="1" height="1" fill="#fff" />
    </>,
  );
}

export function EyeIcon({ size = 16 }: IconProps) {
  return wrap(
    size,
    <>
      {/* lid outline */}
      <rect x="4" y="6" width="8" height="1" fill="#1a0f1f" />
      <rect x="4" y="9" width="8" height="1" fill="#1a0f1f" />
      <rect x="3" y="7" width="1" height="2" fill="#1a0f1f" />
      <rect x="12" y="7" width="1" height="2" fill="#1a0f1f" />
      {/* white */}
      <rect x="4" y="7" width="8" height="2" fill="#f4e4c1" />
      {/* iris */}
      <rect x="7" y="6" width="2" height="4" fill="#e8a23a" />
      <rect x="7" y="7" width="2" height="2" fill="#1a0f1f" />
      <rect x="7" y="7" width="1" height="1" fill="#ffd24a" />
    </>,
  );
}
