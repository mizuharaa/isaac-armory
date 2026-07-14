import { useEffect, useMemo, useRef, useState } from "react";
import SpriteImg from "../components/SpriteImg";
import { computeStats, type EquippedItem } from "../engine/stats";
import { characterSheetUrl, loadFirst, loadGameAssets } from "../game/assets";
import { Game, VIEW_H, VIEW_W, type RoomId } from "../game/engine";
import { characterPortraitCandidates, itemSpriteCandidates } from "../lib/assets";
import { allItems, characterBySlug, itemBySlug, poolBySlug } from "../lib/data";
import { fuzzyScore } from "../lib/fuzzy";
import type { Item } from "../lib/types";
import { useLoadout } from "../store/loadout";

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
    return scored.slice(0, 60).map((x) => x.i);
  }, [query]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
      <div className="panel max-h-full w-full max-w-3xl overflow-hidden p-4">
        <div className="flex items-center gap-3">
          <h3 className="punch font-pixel text-sm text-gold">{title}</h3>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="flex-1 border-2 border-basement-border bg-black/50 px-3 py-2 text-xl text-ink focus:border-gold focus:outline-none"
          />
          <button onClick={onClose} className="border-2 border-basement-border px-3 py-1 text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <div className="mt-3 grid max-h-96 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
          {results.map((item) => (
            <button
              key={item.slug}
              onClick={() => onPick(item)}
              title={`${item.name} — ${item.description.slice(0, 120)}`}
              className={`flex flex-col items-center border-2 p-2 hover:bg-basement-raised ${
                equipped?.includes(item.slug) ? "border-heal" : "border-basement-border"
              }`}
            >
              <SpriteImg
                candidates={itemSpriteCandidates(item)}
                alt=""
                className="pixelated h-12 w-12 object-contain"
              />
              <span className="w-full truncate text-center text-sm text-muted">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** In-game style stat line for the overlay HUD. */
function HudStat({ label, value, flash }: { label: string; value: string; flash?: "up" | "down" | null }) {
  return (
    <div className="flex items-center gap-2 leading-none">
      <span className="punch w-7 font-pixel text-[11px] text-[#d5cdb7]">{label}</span>
      <span className="punch font-pixelbody text-[22px] text-white">{value}</span>
      {flash && (
        <span className={`stat-flash punch font-pixel text-[11px] ${flash === "up" ? "text-heal" : "text-hurt"}`}>
          {flash === "up" ? "▲" : "▼"}
        </span>
      )}
    </div>
  );
}

const STAT_KEYS = ["speed", "tearsPerSecond", "damage", "range", "shotSpeed", "luck"] as const;
const STAT_ICON: Record<(typeof STAT_KEYS)[number], string> = {
  speed: "SPD",
  tearsPerSecond: "TRS",
  damage: "DMG",
  range: "RNG",
  shotSpeed: "SHT",
  luck: "LCK",
};

export default function Playground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [scale, setScale] = useState(2);
  const [room, setRoom] = useState<RoomId>("main");
  const [debugOpen, setDebugOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // stat flash bookkeeping
  const prevStats = useRef(stats);
  const [flashes, setFlashes] = useState<Partial<Record<(typeof STAT_KEYS)[number], "up" | "down">>>({});
  useEffect(() => {
    const next: typeof flashes = {};
    for (const k of STAT_KEYS) {
      if (stats[k] > prevStats.current[k] + 1e-9) next[k] = "up";
      else if (stats[k] < prevStats.current[k] - 1e-9) next[k] = "down";
    }
    prevStats.current = stats;
    if (Object.keys(next).length) {
      setFlashes(next);
      const t = setTimeout(() => setFlashes({}), 1800);
      return () => clearTimeout(t);
    }
  }, [stats]);

  const tags = useMemo(() => {
    const t = new Set<string>();
    for (const i of equippedItems) for (const tag of i.behaviorTags) t.add(tag);
    if (character.innate?.some((s) => /flight/i.test(s))) t.add("flight");
    if (equippedItems.some((i) => (i.statModifiers.damageMult ?? 1) >= 1.5)) t.add("size_up");
    return t;
  }, [equippedItems, character]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onPickup = (slug) => equip(slug);
    game.onRoomChange = (r) => setRoom(r);
    loadGameAssets().then((a) => game.setAssets(a));

    const shopPool = poolBySlug.get("shop");
    if (shopPool) {
      const stock = [...shopPool.items]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((e) => itemBySlug.get(e.slug))
        .filter((i): i is Item => !!i);
      Promise.all(stock.map((i) => loadFirst(itemSpriteCandidates(i)))).then((imgs) => {
        game.setShopPedestals(
          stock.map((item, idx) => ({ slug: item.slug, img: imgs[idx], price: item.shopPrice ?? 15 })),
        );
      });
    }
    return () => {
      game.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadFirst([characterSheetUrl(character.slug)]),
      loadFirst(characterPortraitCandidates(character)),
    ]).then(([sheet, portrait]) => {
      if (alive) gameRef.current?.setPlayerSheet(sheet, portrait);
    });
    return () => {
      alive = false;
    };
  }, [character]);

  // integer scaling to fill the shell
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const fit = () => {
      const s = Math.max(1, Math.floor(Math.min(el.clientWidth / VIEW_W, el.clientHeight / VIEW_H)));
      setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // hotkeys: overlays + fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") {
        setDebugOpen(false);
        setEquipOpen(false);
      } else if (typing) {
        return;
      } else if (e.key === "`") setDebugOpen((v) => !v);
      else if (e.key.toLowerCase() === "b" && !debugOpen) setEquipOpen((v) => !v);
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugOpen]);
  useEffect(() => {
    gameRef.current?.setPaused(debugOpen || equipOpen);
  }, [debugOpen, equipOpen]);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen();
  };

  const spawnItem = (item: Item) => {
    loadFirst(itemSpriteCandidates(item)).then((img) => gameRef.current?.spawnPedestal(item.slug, img));
    setDebugOpen(false);
  };

  const hearts = useMemo(() => {
    const h = character.health;
    return {
      red: h.red + stats.bonusHearts.red,
      soul: h.soul + stats.bonusHearts.soul,
      black: h.black + stats.bonusHearts.black,
      bone: h.bone ?? 0,
      coin: h.coin ?? 0,
    };
  }, [character, stats]);

  return (
    <div
      ref={shellRef}
      className="relative flex items-center justify-center overflow-hidden bg-black"
      style={{ height: isFullscreen ? "100vh" : "calc(100vh - 64px)" }}
    >
      {/* game canvas, integer-scaled */}
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="pixelated"
        style={{ width: VIEW_W * scale, height: VIEW_H * scale, imageRendering: "pixelated" }}
      />

      {/* ------- overlay HUD (in-game style) ------- */}
      <div className="pointer-events-none absolute inset-0">
        {/* hearts + stats, top-left */}
        <div className="absolute left-3 top-2 space-y-0.5">
          <div className="mb-1 flex flex-wrap gap-0.5">
            {Array.from({ length: hearts.red }, (_, i) => (
              <span key={`r${i}`} className="punch text-xl leading-none text-[#e02b2b]">♥</span>
            ))}
            {Array.from({ length: hearts.soul }, (_, i) => (
              <span key={`s${i}`} className="punch text-xl leading-none text-[#aebfd8]">♥</span>
            ))}
            {Array.from({ length: hearts.black }, (_, i) => (
              <span key={`b${i}`} className="punch text-xl leading-none text-[#3a2b4a]">♥</span>
            ))}
            {Array.from({ length: hearts.bone }, (_, i) => (
              <span key={`n${i}`} className="punch text-xl leading-none text-[#d8c9a3]">♥</span>
            ))}
            {Array.from({ length: hearts.coin }, (_, i) => (
              <span key={`c${i}`} className="punch text-xl leading-none text-[#f2d75e]">♥</span>
            ))}
            {hearts.red + hearts.soul + hearts.black + hearts.bone + hearts.coin === 0 && (
              <span className="punch font-pixel text-[10px] text-muted">NO HEALTH</span>
            )}
          </div>
          {STAT_KEYS.map((k) => (
            <HudStat key={k} label={STAT_ICON[k]} value={stats[k].toFixed(2)} flash={flashes[k]} />
          ))}
          <div className="pt-1">
            <HudStat label="DPS" value={stats.dps.toFixed(2)} />
          </div>
        </div>

        {/* loadout strip, top-right (item-tracker style) */}
        <div className="pointer-events-auto absolute right-3 top-2 flex max-w-[40%] flex-wrap justify-end gap-1">
          {equippedItems.map((i) => (
            <button
              key={i.slug}
              onClick={() => unequip(i.slug)}
              title={`${i.name} (click to unequip)`}
              className="border border-white/10 bg-black/40 p-0.5 hover:border-hurt"
            >
              <SpriteImg candidates={itemSpriteCandidates(i)} alt={i.name} className="pixelated h-8 w-8 object-contain" />
            </button>
          ))}
          {equippedItems.length > 0 && (
            <button
              onClick={clearLoadout}
              className="punch border border-white/10 bg-black/40 px-2 font-pixel text-[9px] text-muted hover:text-hurt"
            >
              CLEAR
            </button>
          )}
        </div>

        {/* room title + controls, bottom */}
        <div className="absolute bottom-2 left-0 right-0 flex items-end justify-between px-3">
          <span className="punch font-pixel text-[11px] text-[#d5cdb7]">
            {room === "main" ? "THE BASEMENT" : "THE SHOP"}
          </span>
          <span className="punch text-right font-pixelbody text-lg leading-tight text-[#bfb49b]">
            WASD move · ARROWS shoot · E bomb · B equip · ` spawn · F fullscreen
          </span>
        </div>

        {/* fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="punch pointer-events-auto absolute right-3 bottom-10 border-2 border-white/15 bg-black/40 px-3 py-2 font-pixel text-[10px] text-[#d5cdb7] hover:border-gold hover:text-gold"
        >
          {isFullscreen ? "EXIT [F]" : "FULLSCREEN [F]"}
        </button>
      </div>

      {debugOpen && <ItemPicker title="SPAWN ITEM" onPick={spawnItem} onClose={() => setDebugOpen(false)} />}
      {equipOpen && (
        <ItemPicker
          title="EQUIP"
          equipped={equipped}
          onPick={(item) => (equipped.includes(item.slug) ? unequip(item.slug) : equip(item.slug))}
          onClose={() => setEquipOpen(false)}
        />
      )}
    </div>
  );
}
