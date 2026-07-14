import { memo } from "react";
import { itemSpriteCandidates } from "../lib/assets";
import type { Item } from "../lib/types";
import SpriteImg from "./SpriteImg";
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
      className={`hover-wiggle group panel relative flex flex-col items-center gap-1.5 border-2 p-3 pt-4 text-center hover:bg-basement-raised ${
        QUALITY_EDGE[String(item.quality)]
      }`}
      title={item.quote || item.name}
    >
      {/* isaacguru-style ID pill */}
      <span className="punch absolute -top-2.5 left-1/2 -translate-x-1/2 border-2 border-[#8a63d2] bg-[#5b3fa8] px-2 font-pixel text-[10px] leading-5 text-white">
        {item.type === "trinket" ? "T" : ""}#{item.id ?? "?"}
      </span>
      <span className="absolute left-1.5 top-1.5">
        <TierBadge tier={item.tier} source={item.tierSource} />
      </span>
      {equipped && (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 bg-heal" title="In loadout" />
      )}
      <div className="overflow-visible py-1">
        <SpriteImg
          candidates={itemSpriteCandidates(item)}
          alt={item.name}
          width={96}
          height={96}
          className="sprite-zoom pixelated h-24 w-24 object-contain"
        />
      </div>
      <span className="punch w-full truncate text-lg leading-tight text-ink group-hover:text-gold">
        {item.name}
      </span>
    </button>
  );
});
