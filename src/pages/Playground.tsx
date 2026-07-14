import { useEffect, useMemo, useRef, useState } from "react";
import StatBars from "../components/StatBars";
import { computeStats, type EquippedItem } from "../engine/stats";
import { Game, VIEW_H, VIEW_W, type RoomId } from "../game/engine";
import { allItems, characterBySlug, itemBySlug, poolBySlug } from "../lib/data";
import { fuzzyScore } from "../lib/fuzzy";
import type { Item } from "../lib/types";
import { useLoadout } from "../store/loadout";

const imageCache = new Map<string, HTMLImageElement>();
function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function ItemPicker({
  title,
  onPick,
  equipped,
  onClose,
}: {
  title: string;
  onPick: (item: Item) => void;
  equipped?: string[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const scored = allItems
      .map((i) => ({ i, score: fuzzyScore(query, i.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name));
    return scored.slice(0, 48).map((x) => x.i);
  }, [query]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-full w-full max-w-2xl overflow-hidden border-4 border-basement-border bg-basement-panel p-4">
        <div className="flex items-center gap-3">
          <h3 className="font-pixel text-xs text-gold">{title}</h3>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="flex-1 border-2 border-basement-border bg-basement px-2 py-1 text-ink focus:border-gold focus:outline-none"
          />
          <button onClick={onClose} className="border-2 border-basement-border px-2 text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <div className="mt-3 grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
          {results.map((item) => (
            <button
              key={item.slug}
              onClick={() => onPick(item)}
              title={`${item.name} — ${item.description.slice(0, 120)}`}
              className={`flex flex-col items-center border p-1.5 hover:bg-basement-raised ${
                equipped?.includes(item.slug) ? "border-heal" : "border-basement-border"
              }`}
            >
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" loading="lazy" className="pixelated h-10 w-10 object-contain" />
              )}
              <span className="w-full truncate text-center text-xs text-muted">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Playground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [scale, setScale] = useState(2);
  const [room, setRoom] = useState<RoomId>("main");
  const [debugOpen, setDebugOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);

  const characterSlug = useLoadout((s) => s.characterSlug);
  const equipped = useLoadout((s) => s.equipped);
  const equip = useLoadout((s) => s.equip);
  const unequip = useLoadout((s) => s.unequip);
  const clearLoadout = useLoadout((s) => s.clearLoadout);

  const character = characterBySlug.get(characterSlug) ?? characterBySlug.get("isaac")!;
  const equippedItems = useMemo(
    () => equipped.map((s) => itemBySlug.get(s)).filter((i): i is Item => !!i),
    [equipped],
  );
  const stats = useMemo(() => {
    const inputs: EquippedItem[] = equippedItems.map((i) => ({
      slug: i.slug,
      statModifiers: i.statModifiers,
      behaviorTags: i.behaviorTags,
    }));
    return computeStats(character.baseStats, inputs);
  }, [character, equippedItems]);

  const tags = useMemo(() => {
    const t = new Set<string>();
    for (const i of equippedItems) for (const tag of i.behaviorTags) t.add(tag);
    if (character.innate?.some((s) => /flight/i.test(s))) t.add("flight");
    if (equippedItems.some((i) => (i.statModifiers.damageMult ?? 1) >= 1.5)) t.add("size_up");
    return t;
  }, [equippedItems, character]);

  // create / destroy the game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onPickup = (slug) => equip(slug);
    game.onRoomChange = (r) => setRoom(r);

    // shop stock: three random shop-pool items
    const shopPool = poolBySlug.get("shop");
    if (shopPool) {
      const stock = [...shopPool.items]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((e) => itemBySlug.get(e.slug))
        .filter((i): i is Item => !!i);
      Promise.all(stock.map((i) => loadImage(i.imageUrl))).then((imgs) => {
        game.setShopPedestals(
          stock.map((item, idx) => ({
            slug: item.slug,
            img: imgs[idx],
            price: item.shopPrice ?? 15,
          })),
        );
      });
    }
    return () => {
      game.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live params from the stat engine
  useEffect(() => {
    gameRef.current?.setParams({
      speed: stats.speed,
      fireDelay: stats.fireDelay,
      damage: stats.damage,
      range: stats.range,
      shotSpeed: stats.shotSpeed,
      tags,
    });
  }, [stats, tags]);

  // real character sprite
  useEffect(() => {
    loadImage(character.imageUrl).then((img) => gameRef.current?.setPlayerImage(img));
  }, [character]);

  // integer scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () =>
      setScale(Math.max(1, Math.floor(Math.min(el.clientWidth / VIEW_W, (window.innerHeight - 220) / VIEW_H))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // overlay hotkeys; overlays pause the sim
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") {
        setDebugOpen(false);
        setEquipOpen(false);
      } else if (typing) {
        return; // don't toggle overlays while typing in a search box
      } else if (e.key === "`") setDebugOpen((v) => !v);
      else if (e.key.toLowerCase() === "b" && !debugOpen) setEquipOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debugOpen]);
  useEffect(() => {
    gameRef.current?.setPaused(debugOpen || equipOpen);
  }, [debugOpen, equipOpen]);

  const spawnItem = (item: Item) => {
    loadImage(item.imageUrl).then((img) => gameRef.current?.spawnPedestal(item.slug, img));
    setDebugOpen(false);
  };

  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row">
      {/* Left HUD — like the in-game stats HUD */}
      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="border-4 border-basement-border bg-basement-panel p-3">
          <div className="mb-2 flex items-center gap-2">
            {character.imageUrl && (
              <img src={character.imageUrl} alt="" className="pixelated h-10 w-10 object-contain" />
            )}
            <div>
              <p className="font-pixel text-[10px] text-gold">{character.name}</p>
              <p className="text-sm text-muted">DPS {stats.dps.toFixed(2)}</p>
            </div>
          </div>
          <StatBars stats={stats} />
        </div>

        <div className="border-4 border-basement-border bg-basement-panel p-3 text-sm text-muted">
          <p className="font-pixel text-[9px] text-ink">CONTROLS</p>
          <p className="mt-1">WASD — move · Arrows — fire tears</p>
          <p>E — bomb · B — equip menu · ` — item spawner</p>
          <p>Top door leads to the SHOP. Hit the punching bag to see your DPS.</p>
        </div>
      </aside>

      {/* Canvas + top item strip */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex min-h-10 flex-wrap items-center gap-1 border-2 border-basement-border bg-basement-panel p-1.5">
          <span className="mr-1 font-pixel text-[9px] text-muted">LOADOUT</span>
          {equippedItems.map((i) => (
            <button
              key={i.slug}
              onClick={() => unequip(i.slug)}
              title={`${i.name} (click to unequip)`}
              className="border border-basement-border p-0.5 hover:border-hurt"
            >
              {i.imageUrl && <img src={i.imageUrl} alt={i.name} className="pixelated h-7 w-7 object-contain" />}
            </button>
          ))}
          {equippedItems.length === 0 && <span className="text-sm text-muted">empty — press B</span>}
          {equippedItems.length > 0 && (
            <button onClick={clearLoadout} className="ml-auto border border-basement-border px-2 py-0.5 text-xs text-muted hover:text-hurt">
              clear
            </button>
          )}
        </div>

        <div ref={containerRef} className="relative flex justify-center bg-black/60 py-3">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="pixelated border-4 border-basement-border"
            style={{ width: VIEW_W * scale, height: VIEW_H * scale, imageRendering: "pixelated" }}
          />
          <span className="absolute left-2 top-1 font-pixel text-[9px] text-muted">
            {room === "main" ? "THE BASEMENT" : "THE SHOP"}
          </span>

          {debugOpen && (
            <ItemPicker title="SPAWN ITEM" onPick={spawnItem} onClose={() => setDebugOpen(false)} />
          )}
          {equipOpen && (
            <ItemPicker
              title="EQUIP"
              equipped={equipped}
              onPick={(item) => (equipped.includes(item.slug) ? unequip(item.slug) : equip(item.slug))}
              onClose={() => setEquipOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
