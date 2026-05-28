import { createFileRoute } from "@tanstack/react-router";
import FarmGame from "@/components/FarmGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "สวนผักไทย — Thai Farm Game" },
      {
        name: "description",
        content: "เกมปลูกผักสไตล์ไทย แนว Stardew Valley เดินขุดปลูกผักไทยพื้นบ้าน",
      },
      { property: "og:title", content: "สวนผักไทย — Thai Farm Game" },
      { property: "og:description", content: "เกมปลูกผักสไตล์ไทย แนว Stardew" },
    ],
  }),
  component: () => <FarmGame />,
});
