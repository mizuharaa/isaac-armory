import { memo } from "react";
import type { Item } from "../lib/types";

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
      className={`hover-wiggle group relative flex flex-col items-center gap-1 border-2 bg-basement-panel p-2 text-center transition-transform hover:-translate-y-0.5 hover:bg-basement-raised ${
        QUALITY_EDGE[String(item.quality)]
      }`}
      title={item.quote || item.name}
    >
      {equipped && (
        <span className="absolute right-1 top-1 h-2 w-2 bg-heal" title="In loadout" />
      )}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          width={64}
          height={64}
          className="pixelated h-16 w-16 object-contain"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center text-muted">?</span>
      )}
      <span className="w-full truncate text-sm leading-tight text-ink group-hover:text-gold">
        {item.name}
      </span>
    </button>
  );
});
