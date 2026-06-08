import { createFileRoute } from "@tanstack/react-router";
import MultiplayerGame from "@/components/MultiplayerGame";
import type { MatchModeSetting, MatchRole } from "@/lib/match-protocol";

export const Route = createFileRoute("/match/$code")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { role: MatchRole; mode?: MatchModeSetting } => ({
    role: search.role === "player" ? "player" : "spectator",
    mode: search.mode === "2v2" ? "2v2" : search.mode === "1v1" ? "1v1" : undefined,
  }),
  head: ({ params }) => {
    const title = `ห้องแข่ง ${params.code} — สวนผักไทย 1v1`;
    const description =
      "ชวนเพื่อนแข่งปลูกผักไทยแบบเรียลไทม์ ขุดดิน ปลูก เก็บเกี่ยว แล้วทำคะแนนให้ไวกว่าในสวนผักไทย";
    const path = `/match/${params.code}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: path },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: MatchPage,
});

function MatchPage() {
  const { code } = Route.useParams();
  const { role, mode } = Route.useSearch();
  return <MultiplayerGame code={code} role={role} desiredMode={mode} />;
}
