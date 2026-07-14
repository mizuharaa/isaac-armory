import type { Tier } from "../lib/types";

export const TIER_STYLE: Record<Tier, string> = {
  "S+": "bg-[#b3202a] text-[#ffe9a8] border-[#ffb3b3]",
  S: "bg-[#c9a227] text-[#241a16] border-[#ffe9a8]",
  A: "bg-[#4e7a3a] text-[#e8ddc4] border-[#7fb069]",
  B: "bg-[#33587a] text-[#e8ddc4] border-[#6f9ec9]",
  C: "bg-[#5d5148] text-[#e8ddc4] border-[#93887a]",
  D: "bg-[#3a2a20] text-[#9b8a72] border-[#5d5148]",
  F: "bg-[#1c1214] text-[#d9534f] border-[#5c0d10]",
};

export default function TierBadge({
  tier,
  source,
  size = "sm",
}: {
  tier?: Tier;
  source?: "curated" | "quality";
  size?: "sm" | "lg";
}) {
  if (!tier) return null;
  return (
    <span
      title={
        source === "curated"
          ? "Community meta tier (curated)"
          : "Tier derived from in-game quality"
      }
      className={`inline-flex items-center justify-center border font-pixel ${
        size === "lg" ? "px-2.5 py-1.5 text-xs" : "px-1 py-0.5 text-[9px]"
      } ${TIER_STYLE[tier]}`}
    >
      {tier}
    </span>
  );
}
