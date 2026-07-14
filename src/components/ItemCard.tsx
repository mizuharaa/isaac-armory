import { memo } from "react";
import type { Item } from "../lib/types";
import TierBadge from "./TierBadge";

const QUALITY_EDGE: Record<string, string> = {
  "0": "border-basement-border",
  "1": "border-basement-border",
  "2": "border-muted",
  "3": "border-gold/60",
  "4": "border-gold",
  null: "border-basement-border",
};

export default memo(function ItemCard({
  item,
  equipped,
  onClick,
}: {
  item: Item;
  equipped: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`hover-wiggle group relative flex flex-col items-center gap-1 border-2 bg-basement-panel p-2 pt-3 text-center hover:bg-basement-raised ${
        QUALITY_EDGE[String(item.quality)]
      }`}
      title={item.quote || item.name}
    >
      {/* isaacguru-style ID pill */}
      <span className="absolute -top-2 left-1/2 -translate-x-1/2 border border-[#8a63d2] bg-[#5b3fa8] px-1.5 text-[10px] leading-4 text-white">
        {item.type === "trinket" ? "T" : ""}#{item.id ?? "?"}
      </span>
      <span className="absolute left-1 top-1">
        <TierBadge tier={item.tier} source={item.tierSource} />
      </span>
      {equipped && (
        <span className="absolute right-1 top-1 h-2 w-2 bg-heal" title="In loadout" />
      )}
      <div className="overflow-visible">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            width={64}
            height={64}
            className="sprite-zoom pixelated h-16 w-16 object-contain"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center text-muted">?</span>
        )}
      </div>
      <span className="w-full truncate text-sm leading-tight text-ink group-hover:text-gold">
        {item.name}
      </span>
    </button>
  );
});
