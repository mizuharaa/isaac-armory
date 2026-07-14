import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpriteImg from "../components/SpriteImg";
import { deriveCombat } from "../engine/combat";
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

  const { combat, tags } = useMemo(() => {
    const innate = character.innate ?? [];
    const behaviorTags = new Set<string>();
    for (const i of equippedItems) for (const tag of i.behaviorTags) behaviorTags.add(tag);
    const maxMult = Math.max(1, ...equippedItems.map((i) => i.statModifiers.damageMult ?? 1));
    return { combat: deriveCombat(equipped, behaviorTags, innate, maxMult), tags: behaviorTags };
  }, [equippedItems, equipped, character]);

  // ------- active item (SPACE) with charge meter -------
  const activeItem = useMemo(
    () => equippedItems.filter((i) => i.type === "active").at(-1) ?? null,
    [equippedItems],
  );
  const maxCharge = useMemo(() => {
    if (!activeItem) return 0;
    return typeof activeItem.recharge === "number" ? Math.max(1, Math.min(12, activeItem.recharge)) : 6;
  }, [activeItem]);
  const [charge, setCharge] = useState(0);
  useEffect(() => {
    setCharge(maxCharge); // arrives fully charged in the sandbox
    if (!activeItem) return;
    const iv = setInterval(() => setCharge((c) => Math.min(maxCharge, c + 1)), 4000);
    return () => clearInterval(iv);
  }, [activeItem, maxCharge]);

  const useActive = useCallback(() => {
    if (!activeItem || charge < maxCharge) {
      if (activeItem) gameRef.current?.toast("not charged!", "#9b8a72");
      return;
    }
    setCharge(0);
    void gameRef.current?.applyActiveEffect(activeItem.slug);
  }, [activeItem, charge, maxCharge]);

  // ------- pocket item (Q) — cards from the character's starting pickups -------
  const pocketCard = useMemo(() => {
    const pickups = character.startingPickups ?? "";
    if (/fool/i.test(pickups)) return { name: "0 - The Fool", effect: "fool" as const };
    if (/holy card/i.test(pickups)) return { name: "Holy Card", effect: "holy" as const };
    return null;
  }, [character]);
  const [pocketUsed, setPocketUsed] = useState(false);
  useEffect(() => setPocketUsed(false), [character]);

  const usePocket = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    if (!pocketCard) return game.toast("no pocket item", "#9b8a72");
    if (pocketUsed) return game.toast("already used!", "#9b8a72");
    setPocketUsed(true);
    if (pocketCard.effect === "fool") game.teleportHome();
    else game.grantShield();
  }, [pocketCard, pocketUsed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.onPickup = (slug) => equip(slug);
    game.onRoomChange = (r) => setRoom(r);
    game.onOpenPicker = () => setDebugOpen(true);
    game.onResetRun = () => {
      const { characterSlug: cur, selectCharacter: sel } = useLoadout.getState();
      sel(cur); // resets loadout to the character's starting items
    };
    game.onAbsorb = (slugs) => {
      const { equip: eq } = useLoadout.getState();
      for (const s of slugs) eq(s);
    };
    game.itemProvider = async (n) => {
      const picks = [...allItems].filter((i) => i.type !== "trinket").sort(() => Math.random() - 0.5).slice(0, n);
      const imgs = await Promise.all(picks.map((i) => loadFirst(itemSpriteCandidates(i))));
      return picks.map((i, idx) => ({ slug: i.slug, img: imgs[idx] }));
    };
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
      combat,
    });
  }, [stats, combat, tags]);

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

  // scale to fill the shell in quarter steps — whole-integer flooring left
  // huge letterboxes ("can't see anything"); 0.25 steps stay crisp enough
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const fit = () => {
      const raw = Math.min(el.clientWidth / VIEW_W, el.clientHeight / VIEW_H) * 0.99;
      setScale(Math.max(1, Math.floor(raw * 4) / 4));
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
      else if (e.key === " ") useActive();
      else if (e.key.toLowerCase() === "q") usePocket();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugOpen, useActive, usePocket]);
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
        {/* active item + vertical charge meter, very top-left (like the game) */}
        {activeItem && (
          <div className="pointer-events-auto absolute left-3 top-2 flex items-start gap-1">
            {/* charge meter: green segments filling bottom-up */}
            <div className="flex h-14 w-3 flex-col-reverse gap-px border-2 border-black/80 bg-black/50 p-px">
              {Array.from({ length: maxCharge }, (_, i) => (
                <span
                  key={i}
                  className={`w-full flex-1 ${
                    i < charge ? (charge >= maxCharge ? "bg-[#7dff5e]" : "bg-[#4fae3a]") : "bg-transparent"
                  }`}
                />
              ))}
            </div>
            <button onClick={useActive} title={`${activeItem.name} — SPACE to use`} className="group">
              <SpriteImg
                candidates={itemSpriteCandidates(activeItem)}
                alt={activeItem.name}
                className={`pixelated h-14 w-14 object-contain ${charge >= maxCharge ? "" : "opacity-50 grayscale"}`}
              />
            </button>
          </div>
        )}


        {/* hearts + stats, top-left below the active item */}
        <div className={`absolute left-3 space-y-0.5 ${activeItem ? "top-[76px]" : "top-2"}`}>
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
          {pocketCard && (
            <button
              onClick={usePocket}
              title={`${pocketCard.name} — Q to use`}
              className={`punch pointer-events-auto mt-2 block border-2 border-white/15 bg-black/40 px-2 py-1 font-pixel text-[9px] ${
                pocketUsed ? "text-muted line-through" : "text-[#e0d6ff]"
              }`}
            >
              [Q] {pocketCard.name}
            </button>
          )}
        </div>

        {/* loadout strip, top-right (item-tracker style, stacks grouped ×N) */}
        <div className="pointer-events-auto absolute right-3 top-2 flex max-w-[40%] flex-wrap justify-end gap-1">
          {[...new Map(equippedItems.map((i) => [i.slug, i])).values()].map((i) => {
            const count = equipped.filter((s) => s === i.slug).length;
            return (
              <button
                key={i.slug}
                onClick={() => unequip(i.slug)}
                title={`${i.name}${count > 1 ? ` ×${count}` : ""} (click to remove one)`}
                className="relative border border-white/10 bg-black/40 p-0.5 hover:border-hurt"
              >
                <SpriteImg candidates={itemSpriteCandidates(i)} alt={i.name} className="pixelated h-8 w-8 object-contain" />
                {count > 1 && (
                  <span className="punch absolute -bottom-1 -right-1 font-pixel text-[9px] text-gold">
                    x{count}
                  </span>
                )}
              </button>
            );
          })}
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
            WASD move · ARROWS shoot
            {combat.fireMode === "brimstone"
              ? " (hold to charge)"
              : combat.chargeShot !== "none"
                ? " (hold, release to fire)"
                : ""}{" "}
            · SPACE active · E bomb · B equip · ` spawn · F fullscreen
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
