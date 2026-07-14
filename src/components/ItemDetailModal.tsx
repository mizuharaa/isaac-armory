import { useEffect } from "react";
import { isImplemented } from "../engine/implemented";
import { itemSpriteCandidates } from "../lib/assets";
import { poolBySlug } from "../lib/data";
import { DLC_LABEL, type Item } from "../lib/types";
import { useLoadout } from "../store/loadout";
import SpriteImg from "./SpriteImg";
import StatModList from "./StatModList";
import TierBadge from "./TierBadge";

function rechargeLabel(recharge: Item["recharge"]): string | null {
  if (recharge === undefined) return null;
  if (recharge === "one_time") return "single use";
  if (recharge === "timed") return "timed recharge";
  if (recharge === "unlimited") return "unlimited";
  return `${recharge} room${recharge === 1 ? "" : "s"} recharge`;
}

const TYPE_LABEL: Record<Item["type"], string> = {
  passive: "Passive item",
  active: "Active item",
  trinket: "Trinket",
};

export default function ItemDetailModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const equipped = useLoadout((s) => s.equipped.includes(item.slug));
  const toggle = useLoadout((s) => s.toggle);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const recharge = rechargeLabel(item.recharge);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-xl overflow-y-auto border-4 border-basement-border bg-basement-panel shadow-[8px_8px_0_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* isaacguru-style header card */}
        <div className="relative flex flex-col items-center gap-2 border-b-2 border-basement-border bg-basement-raised px-5 pb-5 pt-4">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 border-2 border-basement-border px-2 text-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>

          <span className="border border-[#8a63d2] bg-[#5b3fa8] px-2.5 py-0.5 font-pixel text-[10px] text-white">
            {item.type === "trinket" ? "T" : ""}#{item.id ?? "?"}
          </span>

          {item.quality !== null && (
            <span className="text-xl tracking-[0.4em]" title={`Quality ${item.quality}`}>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={i < item.quality! ? "text-gold" : "text-black/60"}>
                  ★
                </span>
              ))}
            </span>
          )}

          <h2 className="text-center font-pixel text-base leading-relaxed text-white drop-shadow-[2px_2px_0_#000]">
            {item.name.toUpperCase()}
          </h2>
          {item.quote && <p className="italic text-[#7aa2ff]">“{item.quote}”</p>}

          <div className="flex items-center gap-2">
            <TierBadge tier={item.tier} source={item.tierSource} size="lg" />
            <span className="border border-basement-border px-1.5 py-0.5 text-sm text-muted">
              {DLC_LABEL[item.dlc]}
            </span>
            {isImplemented(item.slug) ? (
              <span
                className="border border-heal/50 bg-heal/10 px-1.5 py-0.5 text-sm text-heal"
                title="This item has a real coded effect in the Playground — go test it"
              >
                ● Working in Playground
              </span>
            ) : (
              <span
                className="border border-basement-border px-1.5 py-0.5 text-sm text-muted"
                title="Only generic auto-extracted stats apply right now; no special effect coded yet"
              >
                ○ Not yet simulated
              </span>
            )}
          </div>

          <div className="overflow-visible py-3">
            <SpriteImg
              candidates={itemSpriteCandidates(item)}
              alt={item.name}
              className="sprite-zoom sprite-zoom-lg pixelated h-24 w-24 object-contain"
            />
          </div>

          <p className="italic text-muted">
            {TYPE_LABEL[item.type]}
            {recharge ? ` · ${recharge}` : ""}
          </p>
        </div>

        <div className="p-5">
          <p>{item.description}</p>

          <h3 className="mt-4 font-pixel text-xs text-ink">Stats</h3>
          <div className="mt-2">
            <StatModList mods={item.statModifiers} />
            {item.statModifiersSource === "auto" && (
              <p className="mt-1 text-sm text-muted">auto-extracted from the wiki description</p>
            )}
          </div>

          {item.pools.length > 0 && (
            <>
              <h3 className="mt-4 font-pixel text-xs text-ink">Drops in</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.pools.map((p) => (
                  <span
                    key={p}
                    className="border border-basement-border bg-basement px-2 py-0.5 text-sm"
                  >
                    {poolBySlug.get(p)?.name ?? p}
                    {poolBySlug.get(p)?.greedMode ? " (Greed)" : ""}
                  </span>
                ))}
              </div>
            </>
          )}

          {item.unlockCondition && (
            <p className="mt-3 text-sm text-muted">Unlock: {item.unlockCondition}</p>
          )}
          {(item.devilPrice || item.shopPrice) && (
            <p className="mt-1 text-sm text-muted">
              {item.devilPrice ? `Devil deal: ${item.devilPrice} heart(s). ` : ""}
              {item.shopPrice ? `Shop: ${item.shopPrice}¢.` : ""}
            </p>
          )}

          {item.behaviorTags.length > 0 && (
            <div className="mt-4 border-t border-basement-border pt-3 text-center">
              <p className="mb-2 font-pixel text-[10px] text-muted">- TAGS -</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {item.behaviorTags.map((t) => (
                  <span key={t} className="border border-gold/40 px-2 py-0.5 text-sm text-gold">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => toggle(item.slug)}
              className={`border-2 px-4 py-2 font-pixel text-xs ${
                equipped
                  ? "border-hurt text-hurt hover:bg-hurt/10"
                  : "border-heal text-heal hover:bg-heal/10"
              }`}
            >
              {equipped ? "UNEQUIP" : "EQUIP"}
            </button>
            <a
              href={`https://bindingofisaacrebirth.fandom.com/wiki/${encodeURIComponent(
                item.wikiTitle.replace(/ /g, "_"),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted underline hover:text-gold"
            >
              wiki page ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
