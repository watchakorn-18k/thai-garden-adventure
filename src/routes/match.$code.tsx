import { createFileRoute } from "@tanstack/react-router";
import MultiplayerGame from "@/components/MultiplayerGame";

export const Route = createFileRoute("/match/$code")({
  head: ({ params }) => ({
    meta: [{ title: `1v1 · ${params.code} — สวนผักไทย` }],
  }),
  component: MatchPage,
});

function MatchPage() {
  const { code } = Route.useParams();
  return <MultiplayerGame code={code} />;
}
