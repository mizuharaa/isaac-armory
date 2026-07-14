import type { Health } from "../lib/types";

/** Original pixel heart drawn as SVG squares — crisp at any integer scale. */
function PixelHeart({ fill, edge }: { fill: string; edge: string }) {
  return (
    <svg width="22" height="20" viewBox="0 0 11 10" shapeRendering="crispEdges" aria-hidden>
      <path
        d="M1 1h3v1h1v1h1V2h1V1h3v1h1v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1V9H4V8H3V7H2V6H1V5H0V2h1z"
        fill={edge}
      />
      <path
        d="M2 2h2v1h1v1h1V3h1V2h2v1h1v2h-1v1h-1v1h-1v1h-1v1h-1V8H4V7H3V6H2V5H1V3h1z"
        fill={fill}
      />
    </svg>
  );
}

const HEART_COLORS = {
  red: { fill: "#c22026", edge: "#5c0d10" },
  soul: { fill: "#b9c6d8", edge: "#4a5a70" },
  black: { fill: "#2b2233", edge: "#0d0a12" },
  bone: { fill: "#d8c9a3", edge: "#6e6046" },
  coin: { fill: "#c9a227", edge: "#5e4a0e" },
};

export default function Hearts({ health }: { health: Health }) {
  const cells: (keyof typeof HEART_COLORS)[] = [
    ...Array<"red">(health.red).fill("red"),
    ...Array<"soul">(health.soul).fill("soul"),
    ...Array<"black">(health.black).fill("black"),
    ...Array<"bone">(health.bone ?? 0).fill("bone"),
    ...Array<"coin">(health.coin ?? 0).fill("coin"),
  ];
  if (cells.length === 0) {
    return (
      <span className="text-muted">
        {health.type === "none" ? "NO HEALTH" : health.random ? "RANDOM" : "—"}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5" title={health.type}>
      {cells.map((kind, i) => (
        <PixelHeart key={i} {...HEART_COLORS[kind]} />
      ))}
      {health.random && <span className="ml-1 text-sm text-muted">(random)</span>}
    </span>
  );
}
