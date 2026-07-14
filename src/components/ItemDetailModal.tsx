import { useEffect } from "react";
import { poolBySlug } from "../lib/data";
import { DLC_LABEL, type Item } from "../lib/types";
import { useLoadout } from "../store/loadout";
import QualityStars from "./QualityStars";
import StatModList from "./StatModList";

function rechargeLabel(recharge: Item["recharge"]): string | null {
  if (recharge === undefined) return null;
  if (recharge === "one_time") return "single use";
  if (recharge === "timed") return "timed recharge";
  if (recharge === "unlimited") return "unlimited";
  return `${recharge} room${recharge === 1 ? "" : "s"}`;
}

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
        className="max-h-full w-full max-w-xl overflow-y-auto border-4 border-basement-border bg-basement-panel p-5 shadow-[8px_8px_0_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="pixelated h-24 w-24 shrink-0 object-contain"
            />
          )}
          <div className="min-w-0">
            <h2 className="font-pixel text-sm leading-relaxed text-gold">{item.name}</h2>
            {item.quote && <p className="italic text-muted">“{item.quote}”</p>}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
              <QualityStars quality={item.quality} />
              <span className="text-muted">
                {item.type}
                {recharge ? ` · ${recharge}` : ""}
                {item.id !== null ? ` · #${item.id}` : ""}
              </span>
              <span className="border border-basement-border px-1.5 py-0.5 text-muted">
                {DLC_LABEL[item.dlc]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 border-2 border-basement-border px-2 text-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mt-4">{item.description}</p>

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
                <span key={p} className="border border-basement-border bg-basement px-2 py-0.5 text-sm">
                  {poolBySlug.get(p)?.name ?? p}
                  {poolBySlug.get(p)?.greedMode ? " (Greed)" : ""}
                </span>
              ))}
            </div>
          </>
        )}

        {item.behaviorTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.behaviorTags.map((t) => (
              <span key={t} className="border border-gold/40 px-2 py-0.5 text-sm text-gold">
                {t}
              </span>
            ))}
          </div>
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
  );
}
