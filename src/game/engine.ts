/**
 * Playground engine — fixed-timestep (60 Hz) top-down sandbox.
 *
 * Renders at the game's native 1x scale (26 px grid) into a 468×312 buffer
 * (two mirrored 234×156 backdrop quadrants, exactly how the game composes a
 * 1×1 room), then the page integer-scales it to fill the viewport.
 *
 * Art: when locally-imported game assets are present (public/assets/,
 * gitignored) the room, props, tears and player render with the real
 * sprites + real .anm2 frame data; otherwise every draw call falls back to
 * the original hand-drawn pixel art so the deployed build still works.
 */
import type { CombatConfig } from "../engine/combat";
import type { Anm2Data, Anm2Frame, GameAssets } from "./assets";

export const VIEW_W = 468;
export const VIEW_H = 312;
const WALL = 26;
const TICK = 1 / 60;
const ANM_FPS = 30;

export type { FireMode } from "../engine/combat";

export interface GameParams {
  speed: number;
  fireDelay: number;
  damage: number;
  range: number;
  shotSpeed: number;
  tags: Set<string>;
  combat: CombatConfig;
}

const DEFAULT_COMBAT: CombatConfig = {
  fireMode: "tears", shots: 1, homing: false, piercing: false, spectral: false,
  chargeShot: "none", burst: false, continuum: false, bounce: false, falloff: false,
  orbit: false, hover: false, boomerang: false, split: false, wiz: false,
  quadChance: 0, flameChance: 0, deadEye: false, belial: false, shortBrim: false,
  aura: false, shield: false, familiars: [], tint: null, flight: false, sizeUp: false,
};

export type PropKind = "rock" | "poop" | "spike" | "fire" | "tnt" | "dummy" | "pedestal";

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp?: number;
  solid: boolean;
  itemSlug?: string;
  itemImg?: HTMLImageElement;
  price?: number;
  dead?: boolean;
  anim?: number;
}

interface Tear {
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  max: number;
  damage: number;
  splash: number;
  /** ipecac-style lobbed shot — explodes at range end */
  lob?: boolean;
  /** props already damaged (piercing passes through) */
  hit?: Set<Prop>;
  /** Tiny Planet orbital state */
  orbit?: { angle: number; radius: number };
  /** Anti-Gravity hover time remaining */
  hover?: number;
  /** My Reflection boomerang phase */
  boomer?: "out" | "back";
  /** spawned by a split — don't re-split */
  fromSplit?: boolean;
  /** Ghost Pepper / Bird's Eye flame (piercing, drawn as fire) */
  flame?: boolean;
  /** Eye of Belial post-pierce empowerment applied */
  empowered?: boolean;
  /** Dead Eye: did this tear connect with anything */
  hitAny?: boolean;
}

interface Beam {
  dir: { x: number; y: number };
  x: number;
  y: number;
  len: number;
  t: number;
  duration: number;
  damage: number;
  tick: number;
  /** brimstone beams stay attached to the player's mouth while firing */
  attached?: boolean;
  /** intended length before wall clipping (Azazel short beam) */
  baseLen?: number;
}

interface Knife {
  angle: { x: number; y: number };
  dist: number;
  state: "held" | "out" | "back";
  damage: number;
  hit: Set<Prop>;
}

interface Explosion {
  x: number;
  y: number;
  t: number;
}

interface Missile {
  x: number;
  y: number;
  t: number; // countdown to impact
}

interface Ring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  traveled: number;
  max: number;
  damage: number;
  tick: number;
  hit: Set<Prop>;
}

interface Swing {
  dir: { x: number; y: number };
  t: number;
}

interface Familiar {
  x: number;
  y: number;
  damageMult: number;
  cooldown: number;
}

interface Bomb {
  x: number;
  y: number;
  fuse: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  age: number;
  color: string;
}

export type RoomId = "main" | "shop";

const G = 26; // grid cell
const cell = (cx: number, cy: number) => ({ x: WALL + cx * G, y: WALL + cy * G });

function makeMainRoom(): Prop[] {
  const at = (cx: number, cy: number, p: Omit<Prop, "x" | "y">): Prop => ({ ...cell(cx, cy), ...p });
  return [
    at(3, 2, { kind: "rock", w: G, h: G, hp: 1, solid: true }),
    at(4, 2, { kind: "rock", w: G, h: G, hp: 1, solid: true }),
    at(3, 3, { kind: "rock", w: G, h: G, hp: 1, solid: true }),
    at(10, 2, { kind: "poop", w: G, h: G, hp: 3, maxHp: 3, solid: true }),
    at(6, 7, { kind: "poop", w: G, h: G, hp: 3, maxHp: 3, solid: true }),
    at(8, 4, { kind: "spike", w: G, h: G, hp: Infinity, solid: false }),
    at(9, 4, { kind: "spike", w: G, h: G, hp: Infinity, solid: false }),
    at(1, 7, { kind: "fire", w: G, h: G, hp: 2, solid: true }),
    at(13, 1, { kind: "fire", w: G, h: G, hp: 2, solid: true }),
    at(12, 8, { kind: "tnt", w: G, h: G, hp: 1, solid: true }),
    at(12, 4, { kind: "dummy", w: G, h: 40, hp: Infinity, solid: true }),
  ];
}

/** Blood-red multiply tint of a grayscale effect sheet (anm2 RedTint=255). */
function redTintCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const oc = off.getContext("2d")!;
  oc.drawImage(img, 0, 0);
  oc.globalCompositeOperation = "multiply";
  oc.fillStyle = "#e02818";
  oc.fillRect(0, 0, off.width, off.height);
  oc.globalCompositeOperation = "destination-in";
  oc.drawImage(img, 0, 0);
  return off;
}

/** Visual/collision arc height of a tear at its current range progress. */
function tearLift(t: Tear): number {
  const progress = Math.min(1, t.traveled / t.max);
  return t.lob
    ? Math.sin(progress * Math.PI) * 26
    : Math.sin(Math.min(1, progress * 2) * Math.PI * 0.5) * 4 - progress * progress * 14;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private assets: GameAssets | null = null;
  private params: GameParams = {
    speed: 1, fireDelay: 10, damage: 3.5, range: 6.5, shotSpeed: 1, tags: new Set(),
    combat: DEFAULT_COMBAT,
  };
  private playerSheet: HTMLImageElement | HTMLCanvasElement | null = null;
  private playerPortrait: HTMLImageElement | null = null;
  private playerKey = "";
  private headSheet: HTMLImageElement | null = null;
  private headAnim: Anm2Data | null = null;

  private px = VIEW_W / 2;
  private py = VIEW_H / 2 + 40;
  private moveDir: { x: number; y: number } = { x: 0, y: 1 };
  private headDir: "Down" | "Up" | "Left" | "Right" = "Down";
  private walking = false;
  private walkTime = 0;
  private fireCooldown = 0;
  private fireFlash = 0;
  private hurtFlash = 0;
  private holdItem: { img: HTMLImageElement | null; t: number } | null = null;

  private tears: Tear[] = [];
  private beams: Beam[] = [];
  private knife: Knife | null = null;
  private brimCharge = 0; // 0..1 while holding fire in brimstone mode
  private shotCharge = 0; // chocolate milk / tech-x hold-to-charge
  private wasFiring = false;
  private lastFireDir = { x: 0, y: 1 };
  private explosions: Explosion[] = [];
  private missile: Missile | null = null;
  private rings: Ring[] = [];
  private swing: Swing | null = null;
  private ludo: { x: number; y: number } | null = null;
  private deadEyeStreak = 0;
  private familiars: Familiar[] = [];
  private shieldUp = false;
  private shieldTimer = 0;
  private bombs: Bomb[] = [];
  private texts: FloatText[] = [];
  private tintedSheet: HTMLCanvasElement | null = null;
  private tintedKey = "";
  private redLaser: HTMLCanvasElement | null = null;
  private redImpact: HTMLCanvasElement | null = null;
  private keys = new Set<string>();
  private shake = 0;
  private time = 0;
  private paused = false;
  private raf = 0;
  private acc = 0;
  private last = 0;

  room: RoomId = "main";
  private rooms: Record<RoomId, Prop[]> = { main: makeMainRoom(), shop: [] };

  private dummyHits: { t: number; dmg: number }[] = [];
  dummyDps = 0;

  onPickup: (slug: string) => void = () => {};
  onRoomChange: (room: RoomId) => void = () => {};
  /** Supplies n random items (with sprites) for D6 rerolls. */
  itemProvider: (n: number) => Promise<{ slug: string; img: HTMLImageElement | null }[]> = async () => [];
  /** Death Certificate opens the item picker. */
  onOpenPicker: () => void = () => {};
  /** R Key resets the run (loadout back to starting items). */
  onResetRun: () => void = () => {};
  /** Void absorbs pedestal items into the loadout. */
  onAbsorb: (slugs: string[]) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
  }

  setAssets(a: GameAssets) {
    this.assets = a;
  }
  setParams(p: GameParams) {
    this.params = p;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) this.last = performance.now();
    this.keys.clear();
  }
  setPlayerSheet(
    sheet: HTMLImageElement | HTMLCanvasElement | null,
    portrait: HTMLImageElement | null,
    key = "",
    head?: { sheet: HTMLImageElement | null; anim: Anm2Data | null },
  ) {
    this.playerSheet = sheet;
    this.playerPortrait = portrait;
    this.playerKey = key;
    this.headSheet = head?.sheet ?? null;
    this.headAnim = head?.anim ?? null;
    this.tintedSheet = null;
    this.tintedKey = "";
  }
  setShopPedestals(pedestals: { slug: string; img: HTMLImageElement | null; price: number }[]) {
    this.rooms.shop = pedestals.map((p, i) => ({
      kind: "pedestal" as const,
      ...cell(5 + i * 3, 3),
      w: G,
      h: G,
      hp: Infinity,
      solid: false,
      itemSlug: p.slug,
      itemImg: p.img ?? undefined,
      price: p.price,
    }));
  }
  spawnPedestal(slug: string, img: HTMLImageElement | null) {
    const props = this.rooms[this.room];
    const n = props.filter((p) => p.kind === "pedestal").length;
    if (n >= 8) {
      this.toast("the room is full!", "#ff6a5e");
      return;
    }
    props.push({
      kind: "pedestal",
      ...cell(5 + (n % 4) * 2, 5 + Math.floor(n / 4) * 2),
      w: G,
      h: G,
      hp: Infinity,
      solid: false,
      itemSlug: slug,
      itemImg: img ?? undefined,
    });
  }

  toast(text: string, color = "#f2d75e") {
    this.texts.push({ x: this.px, y: this.py - 34, text, age: 0, color });
  }

  /** The Fool card: teleport back to the room's starting position. */
  teleportHome() {
    this.px = VIEW_W / 2;
    this.py = VIEW_H / 2 + 40;
    this.shake = 4;
    this.toast("whoosh!", "#e0d6ff");
  }

  /** Holy Card: one-time mantle shield. */
  grantShield() {
    this.shieldUp = true;
    this.toast("holy card!", "#9ecbff");
  }

  /**
   * Active-item effects (SPACE). Implemented: D6-style rerolls, Diplopia
   * duplication (pedestal cap prevents infinite dupes), Kamikaze!, The Poop.
   * Anything else flashes a "not simulated" note.
   */
  async applyActiveEffect(slug: string): Promise<void> {
    const props = this.props();
    const pedestals = props.filter((p) => p.kind === "pedestal" && p.itemSlug);
    if (["the-d6", "d-infinity", "d100", "d20", "eternal-d6", "spindown-dice"].includes(slug)) {
      if (pedestals.length === 0) return this.toast("nothing to reroll");
      const fresh = await this.itemProvider(pedestals.length);
      pedestals.forEach((p, i) => {
        p.itemSlug = fresh[i]?.slug ?? p.itemSlug;
        p.itemImg = fresh[i]?.img ?? undefined;
        p.anim = 0.3;
      });
      this.shake = 4;
      this.toast("rerolled!");
    } else if (["diplopia", "crooked-penny"].includes(slug)) {
      if (pedestals.length === 0) return this.toast("nothing to duplicate");
      const room = props.filter((p) => p.kind === "pedestal").length;
      const space = Math.max(0, 8 - room);
      if (space === 0) return this.toast("the room is full!", "#ff6a5e");
      for (const p of pedestals.slice(0, space)) {
        if (slug === "crooked-penny" && Math.random() < 0.5) continue;
        const n = this.props().filter((q) => q.kind === "pedestal").length;
        this.props().push({
          kind: "pedestal",
          ...cell(5 + (n % 4) * 2, 5 + Math.floor(n / 4) * 2),
          w: G, h: G, hp: Infinity, solid: false,
          itemSlug: p.itemSlug, itemImg: p.itemImg,
        });
      }
      this.shake = 4;
      this.toast("doubled!");
    } else if (slug === "death-certificate") {
      this.onOpenPicker();
    } else if (slug === "r-key") {
      for (const id of ["main", "shop"] as RoomId[]) {
        this.rooms[id] = this.rooms[id].filter((q) => q.kind !== "pedestal");
      }
      this.rooms.main = makeMainRoom();
      this.onResetRun();
      this.toast("run reset!");
    } else if (slug === "void" || slug === "abyss") {
      if (pedestals.length === 0) return this.toast("nothing to absorb");
      const absorbed = pedestals.map((q) => q.itemSlug!).filter(Boolean);
      for (const q of pedestals) {
        q.itemSlug = undefined;
        q.itemImg = undefined;
        q.anim = 0.3;
      }
      this.onAbsorb(absorbed);
      this.shake = 6;
      this.toast(`absorbed ${absorbed.length} item${absorbed.length === 1 ? "" : "s"}!`, "#b48ae0");
    } else if (slug === "kamikaze") {
      this.explode(this.px, this.py);
    } else if (slug === "the-poop") {
      const n = this.props().length;
      this.props().push({ kind: "poop", x: this.px - 13, y: this.py + 14, w: G, h: G, hp: 3, maxHp: 3, solid: true, anim: 0.2 });
      if (n === this.props().length - 1) this.toast("plop.", "#a87b4f");
    } else if (["mr-boom", "remote-detonator", "bobs-rotten-head"].includes(slug)) {
      this.explode(this.px + this.moveDir.x * 40, this.py + this.moveDir.y * 40);
    } else {
      this.toast("(effect not simulated)", "#9b8a72");
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || (e.target as HTMLElement)?.tagName === "INPUT") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (e.key.toLowerCase() === "e") this.placeBomb();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  private onBlur = () => {
    this.paused = true;
    this.keys.clear();
  };
  private onFocus = () => {
    this.paused = false;
    this.last = performance.now();
  };

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.paused) {
      this.render();
      return;
    }
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= TICK) {
      this.update(TICK);
      this.acc -= TICK;
    }
    this.render();
  };

  // ------------------------------------------------------------------ update
  private update(dt: number) {
    this.time += dt;
    const p = this.params;
    const flight = p.combat.flight;

    let dx = 0;
    let dy = 0;
    if (this.keys.has("w")) dy -= 1;
    if (this.keys.has("s")) dy += 1;
    if (this.keys.has("a")) dx -= 1;
    if (this.keys.has("d")) dx += 1;
    this.walking = dx !== 0 || dy !== 0;
    if (this.walking) {
      this.walkTime += dt;
      this.moveDir = { x: dx, y: dy };
      const len = Math.hypot(dx, dy);
      const v = (p.speed * 85) / len;
      const nx = this.px + dx * v * dt;
      const ny = this.py + dy * v * dt;
      if (!this.collides(nx, this.py, flight)) this.px = nx;
      if (!this.collides(this.px, ny, flight)) this.py = ny;
    } else {
      this.walkTime = 0;
    }
    this.px = Math.max(WALL + 9, Math.min(VIEW_W - WALL - 9, this.px));
    this.py = Math.max(WALL + 10, Math.min(VIEW_H - WALL - 6, this.py));

    this.checkDoors();

    // firing — arrow keys, 4-directional
    this.fireCooldown -= dt;
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    let fx = 0;
    let fy = 0;
    if (this.keys.has("ArrowUp")) fy = -1;
    else if (this.keys.has("ArrowDown")) fy = 1;
    else if (this.keys.has("ArrowLeft")) fx = -1;
    else if (this.keys.has("ArrowRight")) fx = 1;

    const cb = p.combat;
    const firing = !!(fx || fy);
    if (firing) {
      this.headDir = fy < 0 ? "Up" : fy > 0 ? "Down" : fx < 0 ? "Left" : "Right";
      this.lastFireDir = { x: fx, y: fy };
      this.fireFlash = 0.1;
      // wind-up: starting to fire (or re-pressing) costs half a fire delay
      // before the first shot — holding then keeps the normal cadence
      if (!this.wasFiring) {
        this.fireCooldown = Math.max(this.fireCooldown, ((p.fireDelay + 1) / 30) * 0.5);
      }
    }

    if (cb.fireMode === "brimstone") {
      // wind-up = the full (Brimstone-penalized) fire delay; the beam itself
      // locks out recharging while it fires — no rapid-fire from holding
      const beamActive = this.beams.some((b) => b.attached);
      if (firing && !beamActive) {
        this.brimCharge += dt / Math.max(0.5, (p.fireDelay + 1) / 30);
        if (this.brimCharge >= 1) {
          this.brimCharge = 0;
          for (const [dx, dy] of this.volleyDirs(fx, fy, cb)) this.fireBeam(dx, dy, p, 0.7, p.damage);
        }
      } else if (!firing) {
        this.brimCharge = Math.max(0, this.brimCharge - dt * 2);
      }
    } else if (cb.fireMode === "ludovico") {
      // one persistent tear steered by the arrow keys
      if (!this.ludo) this.ludo = { x: this.px, y: this.py - 40 };
      if (firing) {
        this.ludo.x += fx * 120 * dt;
        this.ludo.y += fy * 120 * dt;
      }
      this.ludo.x = Math.max(WALL + 8, Math.min(VIEW_W - WALL - 8, this.ludo.x));
      this.ludo.y = Math.max(WALL + 8, Math.min(VIEW_H - WALL - 8, this.ludo.y));
      this.fireCooldown -= 0; // cadence handled by tick below
      if (this.fireCooldown <= 0) {
        for (const prop of this.props()) {
          if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal") continue;
          if (
            this.ludo.x > prop.x - 6 && this.ludo.x < prop.x + prop.w + 6 &&
            this.ludo.y > prop.y - 6 && this.ludo.y < prop.y + prop.h + 6
          ) {
            this.damageProp(prop, p.damage, false);
            this.fireCooldown = (p.fireDelay + 1) / 30;
          }
        }
      }
    } else if (cb.chargeShot !== "none") {
      // Chocolate Milk / Monstro's Lung / Tech X: hold to charge, RELEASE fires
      if (firing) {
        this.shotCharge = Math.min(1, this.shotCharge + dt / Math.max(0.4, ((p.fireDelay + 1) / 30) * 2));
      } else if (this.wasFiring && this.shotCharge > 0.1) {
        const d = this.lastFireDir;
        if (cb.chargeShot === "techx") {
          const speed = 130 * p.shotSpeed;
          for (const [dx, dy] of this.volleyDirs(d.x, d.y, cb)) {
            this.rings.push({
              x: this.px + dx * 10, y: this.py - 14 + dy * 10,
              vx: dx * speed, vy: dy * speed,
              radius: 8 + this.shotCharge * 22, traveled: 0,
              max: p.range * G * 1.4, damage: p.damage, tick: 0, hit: new Set(),
            });
          }
        } else if (cb.chargeShot === "lung") {
          // Monstro's Lung: shotgun burst in a cone, count scaled by charge
          const n = Math.round(4 + this.shotCharge * 10);
          const speed = 140 * p.shotSpeed;
          const baseAngle = Math.atan2(d.y, d.x);
          for (let i = 0; i < n; i++) {
            const a = baseAngle + (Math.random() - 0.5) * 0.75;
            const v = speed * (0.8 + Math.random() * 0.4);
            this.tears.push({
              x: this.px + d.x * 9, y: this.py - 14 + d.y * 9,
              vx: Math.cos(a) * v, vy: Math.sin(a) * v,
              traveled: 0, max: p.range * G * (0.6 + Math.random() * 0.5),
              damage: p.damage * 0.7, splash: -1,
            });
          }
        } else {
          this.fireTears(d.x, d.y, p, p.damage * (0.3 + this.shotCharge * 1.7), 1 + this.shotCharge);
        }
        this.shotCharge = 0;
      } else {
        this.shotCharge = 0;
      }
    } else if (firing && this.fireCooldown <= 0) {
      this.fireCooldown = (p.fireDelay + 1) / 30;
      this.fireFlash = 0.12;
      switch (cb.fireMode) {
        case "laser":
          for (const [dx, dy] of this.volleyDirs(fx, fy, cb)) this.fireBeam(dx, dy, p, 0.12, p.damage);
          break;
        case "knife":
          if (this.knife && this.knife.state === "held") {
            this.knife.angle = { x: fx, y: fy };
            this.knife.state = "out";
            this.knife.damage = p.damage * 2;
            this.knife.hit.clear();
          }
          break;
        case "missile":
          if (!this.missile) {
            const mx = Math.max(WALL + 20, Math.min(VIEW_W - WALL - 20, this.px + fx * 90));
            const my = Math.max(WALL + 20, Math.min(VIEW_H - WALL - 20, this.py + fy * 90));
            this.missile = { x: mx, y: my, t: 1.0 };
          }
          break;
        case "sword":
          this.swing = { dir: { x: fx, y: fy }, t: 0.18 };
          for (const prop of this.props()) {
            if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal") continue;
            const cx = prop.x + prop.w / 2 - this.px;
            const cy = prop.y + prop.h / 2 - (this.py - 8);
            const dist = Math.hypot(cx, cy);
            const toward = cx * fx + cy * fy;
            if (dist < 42 && toward > 0) this.damageProp(prop, p.damage * 3, false);
          }
          break;
        case "bombshot": {
          const speed = 120 * p.shotSpeed;
          this.tears.push({
            x: this.px + fx * 9, y: this.py - 14 + fy * 9,
            vx: fx * speed, vy: fy * speed,
            traveled: 0, max: p.range * G, damage: p.damage, splash: -1, lob: true,
          });
          break;
        }
        default:
          this.fireTears(fx, fy, p);
      }
    }
    if (!firing && this.walking) {
      this.headDir =
        this.moveDir.y < 0 ? "Up" : this.moveDir.y > 0 ? "Down" : this.moveDir.x < 0 ? "Left" : "Right";
    }
    this.wasFiring = firing;

    // guided missile steering (Epic Fetus): arrows move the crosshair
    if (this.missile) {
      if (firing) {
        this.missile.x += fx * 140 * dt;
        this.missile.y += fy * 140 * dt;
      }
      this.missile.t -= dt;
      if (this.missile.t <= 0) {
        this.explode(this.missile.x, this.missile.y, p.damage * 10);
        this.missile = null;
      }
    }

    // Tech X rings
    for (const ring of this.rings) {
      ring.x += ring.vx * dt;
      ring.y += ring.vy * dt;
      ring.traveled += Math.hypot(ring.vx, ring.vy) * dt;
      ring.tick -= dt;
      if (ring.tick <= 0) {
        ring.tick = 1 / 15;
        for (const prop of this.props()) {
          if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal") continue;
          const d = Math.hypot(prop.x + prop.w / 2 - ring.x, prop.y + prop.h / 2 - ring.y);
          if (Math.abs(d - ring.radius) < 12 || d < ring.radius) this.damageProp(prop, ring.damage, false);
        }
      }
    }
    this.rings = this.rings.filter((r) => r.traveled < r.max);

    if (this.swing) {
      this.swing.t -= dt;
      if (this.swing.t <= 0) this.swing = null;
    }

    // shooter familiars trail the player and copy shots
    while (this.familiars.length < cb.familiars.length) {
      this.familiars.push({ x: this.px - 20, y: this.py + 10, damageMult: 1, cooldown: 0 });
    }
    if (this.familiars.length > cb.familiars.length) this.familiars.length = cb.familiars.length;
    this.familiars.forEach((f, i) => {
      f.damageMult = cb.familiars[i]?.damageMult ?? 0.75;
      const tx = this.px - this.moveDir.x * 22 * (i + 1) - (i % 2 ? 14 : -14);
      const ty = this.py - this.moveDir.y * 22 * (i + 1) + 6;
      f.x += (tx - f.x) * Math.min(1, 6 * dt);
      f.y += (ty - f.y) * Math.min(1, 6 * dt);
      f.cooldown -= dt;
      if (firing && f.cooldown <= 0 && cb.fireMode !== "sword" && cb.fireMode !== "knife") {
        f.cooldown = (p.fireDelay + 1) / 30;
        const speed = 150 * p.shotSpeed;
        this.tears.push({
          x: f.x + fx * 8, y: f.y - 6 + fy * 8,
          vx: fx * speed, vy: fy * speed,
          traveled: 0, max: p.range * G * 0.8,
          damage: p.damage * f.damageMult, splash: -1,
          hit: cb.piercing ? new Set() : undefined,
        });
      }
    });

    // Holy Mantle shield regeneration
    if (cb.shield) {
      if (!this.shieldUp) {
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) this.shieldUp = true;
      }
    } else {
      this.shieldUp = false;
    }

    if (cb.fireMode !== "ludovico") this.ludo = null;

    // knife lifecycle
    if (cb.fireMode === "knife" && !this.knife) {
      this.knife = { angle: { x: 0, y: 1 }, dist: 0, state: "held", damage: p.damage * 2, hit: new Set() };
    } else if (cb.fireMode !== "knife") {
      this.knife = null;
    }
    if (this.knife && this.knife.state !== "held") {
      const kSpeed = 260 * p.shotSpeed;
      this.knife.dist += (this.knife.state === "out" ? 1 : -1) * kSpeed * dt;
      const max = p.range * G * 1.2;
      if (this.knife.dist >= max) this.knife.state = "back";
      if (this.knife.dist <= 0 && this.knife.state === "back") {
        this.knife.state = "held";
        this.knife.dist = 0;
      }
      const kx = this.px + this.knife.angle.x * this.knife.dist;
      const ky = this.py - 10 + this.knife.angle.y * this.knife.dist;
      for (const prop of this.props()) {
        if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal" || this.knife.hit.has(prop)) continue;
        if (kx > prop.x && kx < prop.x + prop.w && ky > prop.y - 6 && ky < prop.y + prop.h) {
          this.knife.hit.add(prop);
          this.damageProp(prop, this.knife.damage, false);
        }
      }
    }

    // beams tick damage along their line
    for (const beam of this.beams) {
      beam.t += dt;
      beam.tick -= dt;
      // brimstone stays attached to the mouth and sweeps as the player moves
      if (beam.attached) {
        beam.x = this.px + beam.dir.x * 10;
        beam.y = this.py - 14 + beam.dir.y * 10;
        const toWall = this.rayToWall(beam.x, beam.y, beam.dir.x, beam.dir.y);
        beam.len = Math.max(10, Math.min(beam.baseLen ?? Infinity, toWall));
      }
      if (beam.tick <= 0) {
        beam.tick = 1 / 15; // the game's laser tick rate
        for (const prop of this.props()) {
          if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal") continue;
          const cx = prop.x + prop.w / 2;
          const cy = prop.y + prop.h / 2;
          const along = (cx - beam.x) * beam.dir.x + (cy - beam.y) * beam.dir.y;
          const ortho = Math.abs((cx - beam.x) * beam.dir.y - (cy - beam.y) * beam.dir.x);
          if (along > 0 && along < beam.len && ortho < 16) {
            this.damageProp(prop, beam.damage, false);
          }
        }
      }
    }
    this.beams = this.beams.filter((b) => b.t < b.duration);

    for (const t of this.tears) {
      if (t.splash >= 0) {
        t.splash += dt;
        continue;
      }
      // Godhead aura: halo tick-damages anything near the tear in flight
      if (cb.aura) {
        for (const prop of this.props()) {
          if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal" || prop.kind !== "dummy") continue;
          const d = Math.hypot(prop.x + prop.w / 2 - t.x, prop.y + prop.h / 2 - t.y);
          if (d < 22 && Math.random() < dt * 8) this.damageProp(prop, t.damage * 0.33, false);
        }
      }
      // homing: steer toward the nearest damageable prop
      if (cb.homing) {
        let best: Prop | null = null;
        let bestD = 90;
        for (const prop of this.props()) {
          if (prop.dead || prop.kind === "spike" || prop.kind === "pedestal") continue;
          const d = Math.hypot(prop.x + prop.w / 2 - t.x, prop.y + prop.h / 2 - t.y);
          if (d < bestD) {
            bestD = d;
            best = prop;
          }
        }
        if (best) {
          const speed = Math.hypot(t.vx, t.vy);
          const ax = best.x + best.w / 2 - t.x;
          const ay = best.y + best.h / 2 - t.y;
          const al = Math.hypot(ax, ay) || 1;
          t.vx += (ax / al) * speed * 3 * dt;
          t.vy += (ay / al) * speed * 3 * dt;
          const nl = Math.hypot(t.vx, t.vy) || 1;
          t.vx = (t.vx / nl) * speed;
          t.vy = (t.vy / nl) * speed;
        }
      }
      // Anti-Gravity: tears hang in the air before continuing
      if (t.hover && t.hover > 0) {
        t.hover -= dt;
        if (this.tearHit(t, cb.piercing, cb.falloff)) t.splash = 0;
        continue;
      }
      // Tiny Planet: tears orbit the player while the orbit expands
      if (t.orbit) {
        const speed = Math.hypot(t.vx, t.vy);
        t.orbit.angle += 4.2 * dt;
        t.orbit.radius = Math.min(52, t.orbit.radius + 26 * dt);
        t.x = this.px + Math.cos(t.orbit.angle) * t.orbit.radius;
        t.y = this.py - 10 + Math.sin(t.orbit.angle) * t.orbit.radius * 0.8;
        t.traveled += speed * dt * 0.55;
        if (t.traveled >= t.max || this.tearHit(t, true, cb.falloff)) t.splash = 0;
        continue;
      }
      // My Reflection: boomerang back toward the player
      if (t.boomer === "out" && t.traveled >= t.max * 0.55) t.boomer = "back";
      if (t.boomer === "back") {
        const ax = this.px - t.x;
        const ay = this.py - 10 - t.y;
        const al = Math.hypot(ax, ay) || 1;
        const speed = Math.hypot(t.vx, t.vy);
        t.vx += (ax / al) * speed * 6 * dt;
        t.vy += (ay / al) * speed * 6 * dt;
        const nl = Math.hypot(t.vx, t.vy) || 1;
        t.vx = (t.vx / nl) * speed;
        t.vy = (t.vy / nl) * speed;
        if (al < 10) {
          t.splash = 999; // caught — no splash animation
          continue;
        }
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.traveled += Math.hypot(t.vx, t.vy) * dt * (t.boomer === "back" ? 0 : 1);
      let inWall =
        t.x < WALL + 4 || t.x > VIEW_W - WALL - 4 || t.y < WALL + 4 || t.y > VIEW_H - WALL - 4;
      if (inWall && cb.continuum) {
        // Continuum: tears wrap to the opposite side of the room
        if (t.x < WALL + 4) t.x = VIEW_W - WALL - 5;
        else if (t.x > VIEW_W - WALL - 4) t.x = WALL + 5;
        if (t.y < WALL + 4) t.y = VIEW_H - WALL - 5;
        else if (t.y > VIEW_H - WALL - 4) t.y = WALL + 5;
        inWall = false;
      } else if (inWall && cb.bounce) {
        // Rubber Cement: bounce off walls
        if (t.x < WALL + 4 || t.x > VIEW_W - WALL - 4) t.vx = -t.vx;
        if (t.y < WALL + 4 || t.y > VIEW_H - WALL - 4) t.vy = -t.vy;
        t.x = Math.max(WALL + 5, Math.min(VIEW_W - WALL - 5, t.x));
        t.y = Math.max(WALL + 5, Math.min(VIEW_H - WALL - 5, t.y));
        inWall = false;
      }
      if (t.traveled >= t.max || inWall || this.tearHit(t, cb.piercing, cb.falloff)) {
        if (t.lob) this.explode(t.x, t.y);
        // Haemolacria: burst into a ring of shrapnel tears at half damage
        if (cb.burst && !t.lob && t.damage > p.damage * 0.4) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.tears.push({
              x: t.x, y: t.y,
              vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
              traveled: 0, max: G * 2.2, damage: t.damage * 0.5, splash: -1, fromSplit: true,
            });
          }
        }
        // The Parasite / Cricket's Body: split into two perpendicular tears
        if (cb.split && !t.fromSplit && !t.lob) {
          const a = Math.atan2(t.vy, t.vx);
          for (const da of [Math.PI / 2, -Math.PI / 2]) {
            this.tears.push({
              x: t.x, y: t.y,
              vx: Math.cos(a + da) * 110, vy: Math.sin(a + da) * 110,
              traveled: 0, max: G * 3, damage: t.damage * 0.5, splash: -1, fromSplit: true,
            });
          }
        }
        // Dead Eye: a tear that dies without connecting resets the streak
        if (cb.deadEye && !t.hitAny) this.deadEyeStreak = 0;
        t.splash = 0;
      }
    }
    this.tears = this.tears.filter((t) => t.splash < 0.3);

    for (const ex of this.explosions) ex.t += dt;
    this.explosions = this.explosions.filter((ex) => ex.t < 0.5);

    for (const b of this.bombs) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b.x, b.y);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);

    if (!flight) {
      for (const prop of this.props()) {
        if (prop.dead || (prop.kind !== "spike" && prop.kind !== "fire")) continue;
        if (this.overlap(this.px, this.py, 6, prop) && this.hurtFlash <= 0) {
          if (this.shieldUp) {
            // Holy Mantle eats the hit, then needs time to regenerate
            this.shieldUp = false;
            this.shieldTimer = 5;
            this.toast("mantle!", "#9ecbff");
          } else {
            this.hurtFlash = 0.5;
            this.shake = 5;
          }
        }
      }
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    for (const prop of this.props()) {
      if (prop.dead || prop.kind !== "pedestal" || !prop.itemSlug) continue;
      if (this.overlap(this.px, this.py, 9, prop)) {
        this.holdItem = { img: prop.itemImg ?? null, t: 0.6 };
        this.onPickup(prop.itemSlug);
        this.texts.push({
          x: prop.x + prop.w / 2,
          y: prop.y - 8,
          text: prop.price ? `-${prop.price}¢` : "+1",
          age: 0,
          color: "#f2d75e",
        });
        prop.itemSlug = undefined;
        prop.itemImg = undefined;
        this.shake = 3;
      }
    }
    if (this.holdItem) {
      this.holdItem.t -= dt;
      if (this.holdItem.t <= 0) this.holdItem = null;
    }

    for (const ft of this.texts) ft.age += dt;
    this.texts = this.texts.filter((ft) => ft.age < 0.9);
    this.dummyHits = this.dummyHits.filter((h) => this.time - h.t <= 3);
    this.dummyDps = this.dummyHits.reduce((s, h) => s + h.dmg, 0) / 3;
    this.shake = Math.max(0, this.shake - 30 * dt);
    for (const prop of this.props()) if (prop.anim) prop.anim = Math.max(0, prop.anim - dt);
  }

  private props(): Prop[] {
    return this.rooms[this.room];
  }
  private collides(x: number, y: number, flight: boolean): boolean {
    if (flight) return false;
    for (const p of this.props()) {
      if (p.dead || !p.solid) continue;
      if (this.overlap(x, y, 8, p)) return true;
    }
    return false;
  }
  private overlap(x: number, y: number, r: number, p: Prop): boolean {
    return x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h;
  }

  private checkDoors() {
    const doorX = Math.abs(this.px - VIEW_W / 2) < 20;
    if (this.room === "main" && doorX && this.py <= WALL + 11) {
      this.room = "shop";
      this.py = VIEW_H - WALL - 14;
      this.onRoomChange(this.room);
    } else if (this.room === "shop" && doorX && this.py >= VIEW_H - WALL - 7) {
      this.room = "main";
      this.py = WALL + 14;
      this.onRoomChange(this.room);
    }
  }

  /**
   * Direction layer of the firing pipeline: The Wiz / Loki's Horns rewrite
   * the volley directions for WHATEVER weapon fires (tears, brimstone,
   * lasers, rings…) — composition instead of per-weapon special cases.
   */
  private volleyDirs(fx: number, fy: number, cb: CombatConfig): [number, number][] {
    let dirs: [number, number][] = [[fx, fy]];
    if (cb.wiz) {
      const d = Math.SQRT1_2;
      dirs = fy === 0 ? [[fx * d, -d], [fx * d, d]] : [[-d, fy * d], [d, fy * d]];
    }
    if (cb.quadChance > 0 && Math.random() < cb.quadChance) {
      dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    }
    return dirs;
  }

  /** Distance from a point along a (possibly diagonal) direction to the wall. */
  private rayToWall(x: number, y: number, dx: number, dy: number): number {
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (VIEW_W - WALL - x) / dx);
    if (dx < 0) t = Math.min(t, (WALL - x) / dx);
    if (dy > 0) t = Math.min(t, (VIEW_H - WALL - y) / dy);
    if (dy < 0) t = Math.min(t, (WALL - y) / dy);
    return t === Infinity ? 0 : t;
  }

  private fireTears(fx: number, fy: number, p: GameParams, damageOverride?: number, sizeMult = 1) {
    const speed = 150 * p.shotSpeed;
    const cb = p.combat;
    const isLob = cb.fireMode === "lob";
    const dirs = this.volleyDirs(fx, fy, cb);

    // Dead Eye: consecutive hits ramp damage (up to ~4x), a miss resets it
    const deadEyeMult = cb.deadEye ? 1 + this.deadEyeStreak * 0.6 : 1;

    for (const [dx, dy] of dirs) {
      const spread = { x: dy !== 0 ? 1 : 0, y: dx !== 0 ? 1 : 0 };
      for (let i = 0; i < cb.shots; i++) {
        const off = (i - (cb.shots - 1) / 2) * 8;
        const flame = cb.flameChance > 0 && Math.random() < cb.flameChance;
        this.tears.push({
          x: this.px + dx * 9 + spread.x * off,
          y: this.py - 14 + dy * 9 + spread.y * off,
          vx: dx * speed * (isLob ? 0.75 : 1),
          vy: dy * speed * (isLob ? 0.75 : 1),
          traveled: 0,
          max: p.range * G * sizeMult,
          damage: (damageOverride ?? p.damage) * deadEyeMult * (flame ? 2 : 1),
          splash: -1,
          lob: isLob || undefined,
          hit: cb.piercing || flame || cb.belial || cb.orbit ? new Set() : undefined,
          orbit: cb.orbit ? { angle: Math.atan2(dy, dx), radius: 14 } : undefined,
          hover: cb.hover ? 0.5 : undefined,
          boomer: cb.boomerang ? "out" : undefined,
          flame: flame || undefined,
        });
      }
    }
  }

  private fireBeam(fx: number, fy: number, p: GameParams, duration: number, damage: number) {
    const x = this.px + fx * 10;
    const y = this.py - 14 + fy * 10;
    const isBrim = p.combat.fireMode === "brimstone";
    const toWall = this.rayToWall(x, y, fx, fy);
    // Azazel's innate Brimstone is short-range — until he picks up the real
    // Brimstone item, which overrides it with a full-room beam
    const baseLen = p.combat.shortBrim && isBrim ? p.range * G * 1.4 : undefined;
    const len = Math.min(toWall, baseLen ?? toWall);
    // multishot brimstone fires a fattened beam (simplified from parallel beams)
    this.beams.push({
      dir: { x: fx, y: fy }, x, y, len, t: 0, duration,
      damage: damage * (1 + (p.combat.shots - 1) * 0.35), tick: 0,
      attached: isBrim, baseLen,
    });
    this.shake = Math.max(this.shake, isBrim ? 5 : 2);
  }

  private tearHit(t: Tear, piercing: boolean, falloff = false): boolean {
    // collide where the tear is DRAWN (its arc height), not its base line —
    // otherwise shots visually over a target whiff
    const ty = t.y - tearLift(t);
    for (const p of this.props()) {
      if (p.dead || p.kind === "spike" || p.kind === "pedestal") continue;
      if (t.hit?.has(p)) continue;
      if (t.x > p.x - 2 && t.x < p.x + p.w + 2 && ty > p.y - 10 && ty < p.y + p.h + 2) {
        // Proptosis: tears start huge and lose damage with distance
        const progress = Math.min(1, t.traveled / t.max);
        const damage = falloff ? t.damage * Math.max(0.25, 1.5 - progress * 1.5) : t.damage;
        this.damageProp(p, damage, true);
        t.hitAny = true;
        if (p.kind === "dummy" && this.params.combat.deadEye) {
          this.deadEyeStreak = Math.min(5, this.deadEyeStreak + 1);
        }
        if ((piercing || t.flame) && p.kind === "dummy") {
          t.hit?.add(p);
          // Eye of Belial: damage doubles after piercing the first target
          if (this.params.combat.belial && !t.empowered) {
            t.empowered = true;
            t.damage *= 2;
          }
          continue; // piercing tears keep flying through
        }
        return true;
      }
    }
    return false;
  }

  private damageProp(p: Prop, damage: number, fromTear: boolean) {
    p.anim = 0.15;
    if (p.kind === "dummy") {
      this.dummyHits.push({ t: this.time, dmg: damage });
      this.texts.push({
        x: p.x + p.w / 2 + (Math.random() * 12 - 6),
        y: p.y - 4,
        text: damage.toFixed(1),
        age: 0,
        color: "#fff2cf",
      });
      return;
    }
    if (p.kind === "rock" && fromTear) return;
    if (p.hp !== Infinity) {
      p.hp -= 1;
      if (p.hp <= 0) {
        if (p.kind === "tnt") this.explode(p.x + p.w / 2, p.y + p.h / 2);
        p.dead = true;
        p.solid = false;
      }
    }
  }

  private placeBomb() {
    if (this.bombs.length >= 3) return;
    this.bombs.push({ x: this.px, y: this.py + 4, fuse: 1.5 });
  }

  private explode(x: number, y: number, damage = 60) {
    this.shake = 9;
    this.explosions.push({ x, y, t: 0 });
    for (const p of this.props()) {
      if (p.dead) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if (Math.hypot(cx - x, cy - y) < 48) {
        if (p.kind === "dummy") this.damageProp(p, damage, false);
        else if (p.kind !== "pedestal" && p.kind !== "spike") {
          const wasTnt = p.kind === "tnt";
          p.dead = true;
          p.solid = false;
          if (wasTnt) this.explode(cx, cy);
        }
      }
    }
    if (Math.hypot(this.px - x, this.py - y) < 48) {
      if (this.shieldUp) {
        this.shieldUp = false;
        this.shieldTimer = 5;
      } else {
        this.hurtFlash = 0.5;
      }
    }
  }

  // ------------------------------------------------------------------ render
  private render() {
    const c = this.ctx;
    c.save();
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.shake > 0) {
      c.translate(
        Math.round((Math.random() * 2 - 1) * this.shake * 0.5),
        Math.round((Math.random() * 2 - 1) * this.shake * 0.5),
      );
    }

    this.drawRoom(c);
    const drawables: { y: number; draw: () => void }[] = [];
    for (const p of this.props()) drawables.push({ y: p.y + p.h, draw: () => this.drawProp(c, p) });
    for (const b of this.bombs) drawables.push({ y: b.y + 8, draw: () => this.drawBomb(c, b) });
    drawables.push({ y: this.py + 10, draw: () => this.drawPlayer(c) });
    for (const f of this.familiars) drawables.push({ y: f.y + 8, draw: () => this.drawFamiliar(c, f) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    for (const beam of this.beams) this.drawBeam(c, beam);
    for (const ring of this.rings) this.drawRing(c, ring);
    if (this.knife) this.drawKnife(c, this.knife);
    if (this.swing) this.drawSwing(c, this.swing);
    for (const t of this.tears) this.drawTear(c, t);
    if (this.ludo) {
      // the Ludovico tear: one big controlled tear with a soft pulse
      const r = 8 + Math.sin(this.time * 5) * 1;
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse(Math.round(this.ludo.x), Math.round(this.ludo.y) + 12, 6, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#b9c6d8";
      c.beginPath(); c.arc(Math.round(this.ludo.x), Math.round(this.ludo.y), r, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e8f0fa";
      c.fillRect(Math.round(this.ludo.x) - 3, Math.round(this.ludo.y) - 4, 3, 3);
    }
    for (const ex of this.explosions) this.drawExplosion(c, ex);
    if (this.missile) this.drawCrosshair(c, this.missile);

    // charge indicators orbiting the head (brimstone red / charge-shot white)
    const chargeLevel = Math.max(this.brimCharge, this.shotCharge);
    if (chargeLevel > 0.05) {
      const n = Math.ceil(chargeLevel * 6);
      const full = chargeLevel >= 0.95;
      c.fillStyle = this.brimCharge > 0 ? (full ? "#ff5240" : "#a81b25") : full ? "#fff6d8" : "#9a917c";
      for (let i = 0; i < n; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 6;
        c.fillRect(
          Math.round(this.px + Math.cos(a) * 14) - 1,
          Math.round(this.py - 24 + Math.sin(a) * 8) - 1,
          3, 3,
        );
      }
    }

    c.font = "8px 'Press Start 2P', monospace";
    c.textAlign = "center";
    for (const ft of this.texts) {
      c.globalAlpha = 1 - ft.age;
      c.fillStyle = "#000";
      c.fillText(ft.text, Math.round(ft.x) + 1, Math.round(ft.y - ft.age * 14) + 1);
      c.fillStyle = ft.color;
      c.fillText(ft.text, Math.round(ft.x), Math.round(ft.y - ft.age * 14));
      c.globalAlpha = 1;
    }

    if (this.room === "main") {
      const dummy = this.props().find((p) => p.kind === "dummy");
      if (dummy) {
        const label = `DPS ${this.dummyDps.toFixed(1)}`;
        c.fillStyle = "#000";
        c.fillText(label, dummy.x + dummy.w / 2 + 1, dummy.y - 13);
        c.fillStyle = "#f2d75e";
        c.fillText(label, dummy.x + dummy.w / 2, dummy.y - 14);
      }
    }

    if (this.hurtFlash > 0) {
      c.fillStyle = `rgba(190,30,40,${this.hurtFlash * 0.45})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.fillStyle = "#e8ddc4";
      c.font = "10px 'Press Start 2P', monospace";
      c.fillText("PAUSED", VIEW_W / 2, VIEW_H / 2);
    }
    c.restore();
  }

  private drawRoom(c: CanvasRenderingContext2D) {
    const walls = this.assets?.env[this.room === "main" ? "basement_walls" : "shop_walls"];
    const floor = this.assets?.env[this.room === "main" ? "basement_nfloor" : "shop_nfloor"];

    if (walls) {
      // interior floor underlay (texture stretched; interior of walls png is transparent)
      c.fillStyle = this.room === "main" ? "#3b2f26" : "#2e2723";
      c.fillRect(WALL - 6, WALL - 6, VIEW_W - 2 * WALL + 12, VIEW_H - 2 * WALL + 12);
      if (floor) {
        const q = Math.min(floor.width, 234);
        const r = Math.min(floor.height, 156);
        const hw = VIEW_W / 2;
        const hh = VIEW_H / 2;
        c.drawImage(floor, 0, 0, q, r, 0, 0, hw, hh);
        c.save(); c.translate(VIEW_W, 0); c.scale(-1, 1);
        c.drawImage(floor, 0, 0, q, r, 0, 0, hw, hh); c.restore();
        c.save(); c.translate(0, VIEW_H); c.scale(1, -1);
        c.drawImage(floor, 0, 0, q, r, 0, 0, hw, hh); c.restore();
        c.save(); c.translate(VIEW_W, VIEW_H); c.scale(-1, -1);
        c.drawImage(floor, 0, 0, q, r, 0, 0, hw, hh); c.restore();
      }
      // wall quadrants: the real game mirrors the 234x156 corner piece 4 ways
      c.drawImage(walls, 0, 0, 234, 156, 0, 0, 234, 156);
      c.save(); c.translate(VIEW_W, 0); c.scale(-1, 1);
      c.drawImage(walls, 0, 0, 234, 156, 0, 0, 234, 156); c.restore();
      c.save(); c.translate(0, VIEW_H); c.scale(1, -1);
      c.drawImage(walls, 0, 0, 234, 156, 0, 0, 234, 156); c.restore();
      c.save(); c.translate(VIEW_W, VIEW_H); c.scale(-1, -1);
      c.drawImage(walls, 0, 0, 234, 156, 0, 0, 234, 156); c.restore();
    } else {
      // fallback: original drawn room
      for (let ty = 0; ty < VIEW_H / 30 + 1; ty++) {
        for (let tx = 0; tx < VIEW_W / 30 + 1; tx++) {
          c.fillStyle = (tx + ty) % 2 === 0 ? "#2a1f18" : "#251b15";
          c.fillRect(tx * 30, ty * 30, 30, 30);
        }
      }
      c.fillStyle = "#171210";
      c.fillRect(0, 0, VIEW_W, WALL);
      c.fillRect(0, VIEW_H - WALL, VIEW_W, WALL);
      c.fillRect(0, 0, WALL, VIEW_H);
      c.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H);
      c.fillStyle = "#332620";
      for (let x = 4; x < VIEW_W - 4; x += 24) {
        c.fillRect(x, 4, 18, WALL - 10);
        c.fillRect(x, VIEW_H - WALL + 6, 18, WALL - 10);
      }
      for (let y = 4; y < VIEW_H - 4; y += 24) {
        c.fillRect(4, y, WALL - 10, 18);
        c.fillRect(VIEW_W - WALL + 6, y, WALL - 10, 18);
      }
    }

    // door opening (top for main, bottom for shop)
    const doorY = this.room === "main" ? 0 : VIEW_H - WALL;
    c.fillStyle = "#0a0605";
    c.fillRect(VIEW_W / 2 - 20, doorY, 40, WALL);
    c.fillStyle = "#1c1210";
    c.fillRect(VIEW_W / 2 - 16, doorY + (this.room === "main" ? 6 : 0), 32, WALL - 6);
    c.fillStyle = "rgba(242,215,94,0.25)";
    c.fillRect(VIEW_W / 2 - 12, doorY + (this.room === "main" ? WALL - 5 : 0), 24, 5);
  }

  /** Draw a 32px-grid sprite crop with drawn-art fallback. */
  private sheetCrop(
    c: CanvasRenderingContext2D,
    img: HTMLImageElement | undefined,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    fallback: () => void,
  ) {
    if (img) c.drawImage(img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh);
    else fallback();
  }

  private drawProp(c: CanvasRenderingContext2D, p: Prop) {
    const env = this.assets?.env ?? {};
    const jitter = p.anim ? Math.round(Math.sin(this.time * 60) * 1.5) : 0;
    const x = Math.round(p.x + jitter) - 3; // 32px sprites on 26px cells
    const y = Math.round(p.y) - 5;

    if (p.dead) {
      if (p.kind === "poop") {
        this.sheetCrop(c, env.poop, 128, 0, 32, 32, x, y, () => {
          c.fillStyle = "#4a3628";
          c.fillRect(p.x + 2, p.y + p.h - 6, p.w - 4, 4);
        });
      } else if (p.kind !== "pedestal") {
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.beginPath();
        c.ellipse(p.x + p.w / 2, p.y + p.h - 4, p.w / 2 - 2, 3, 0, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }

    switch (p.kind) {
      case "rock":
        this.sheetCrop(c, env.rocks, 0, 0, 32, 32, x, y, () => {
          c.fillStyle = "#5d5148";
          c.fillRect(p.x, p.y + 3, p.w, p.h - 3);
          c.fillStyle = "#77685c";
          c.fillRect(p.x + 2, p.y, p.w - 4, p.h - 6);
        });
        break;
      case "poop": {
        const state = Math.min(3, (p.maxHp ?? 3) - p.hp);
        this.sheetCrop(c, env.poop, state * 32, 0, 32, 32, x, y, () => {
          const shade = p.hp >= 3 ? "#7a5230" : p.hp === 2 ? "#6a4629" : "#553a22";
          c.fillStyle = shade;
          c.fillRect(p.x + 2, p.y + p.h - 8, p.w - 4, 8);
          if (p.hp >= 2) c.fillRect(p.x + 4, p.y + p.h - 14, p.w - 8, 7);
          if (p.hp >= 3) c.fillRect(p.x + 7, p.y + p.h - 19, p.w - 14, 6);
        });
        break;
      }
      case "spike":
        this.sheetCrop(c, env.spikes, 0, 0, 32, 32, x, y, () => {
          c.fillStyle = "#3a3f45";
          for (let i = 0; i < 3; i++) {
            const sx = p.x + 2 + i * 8;
            c.beginPath();
            c.moveTo(sx, p.y + p.h - 2);
            c.lineTo(sx + 3, p.y + 4);
            c.lineTo(sx + 6, p.y + p.h - 2);
            c.closePath();
            c.fill();
          }
        });
        break;
      case "fire": {
        const f = Math.floor(this.time * 8) % 4;
        this.sheetCrop(c, env.fireplace, f * 32, 0, 32, 32, x, y, () => {
          const fb = Math.floor(this.time * 8) % 2;
          c.fillStyle = "#3a2a20";
          c.fillRect(p.x, p.y + p.h - 6, p.w, 6);
          c.fillStyle = fb ? "#d9531e" : "#c9a227";
          c.fillRect(p.x + 4, p.y + 6 - fb * 2, p.w - 8, p.h - 12 + fb * 2);
          c.fillStyle = fb ? "#f2b134" : "#d9531e";
          c.fillRect(p.x + 7, p.y + 10 - fb * 3, p.w - 14, p.h - 16 + fb * 3);
        });
        break;
      }
      case "tnt":
        this.sheetCrop(c, env.tnt, 0, 0, 32, 40, x, y - 8, () => {
          c.fillStyle = "#8c2f2b";
          c.fillRect(p.x, p.y + 4, p.w, p.h - 4);
          c.fillStyle = "#e8ddc4";
          c.font = "8px monospace";
          c.textAlign = "center";
          c.fillText("TNT", p.x + p.w / 2, p.y + p.h - 8);
        });
        break;
      case "dummy": {
        const img = env.punchingbag;
        if (img) {
          const s = 1.6; // punching bag reads better slightly enlarged
          c.drawImage(img, 0, 0, 32, 32, Math.round(p.x + p.w / 2 - 16 * s) + jitter, Math.round(p.y + p.h - 32 * s), Math.round(32 * s), Math.round(32 * s));
        } else {
          c.fillStyle = "#241a16";
          c.fillRect(p.x + p.w / 2 - 2, p.y + p.h - 10, 4, 10);
          c.fillStyle = "#7d7468";
          c.fillRect(p.x + 3, p.y, p.w - 6, p.h - 12);
          c.fillStyle = "#5c0d10";
          c.fillRect(p.x + 3, p.y + 14, p.w - 6, 3);
        }
        break;
      }
      case "pedestal": {
        // stone pedestal (original art — no clean pedestal sprite in grid gfx)
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.beginPath();
        c.ellipse(p.x + p.w / 2, p.y + p.h - 2, 12, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#57493d";
        c.fillRect(p.x + 5, p.y + p.h - 12, p.w - 10, 8);
        c.fillStyle = "#6e5f50";
        c.fillRect(p.x + 3, p.y + p.h - 16, p.w - 6, 5);
        c.fillStyle = "#7d6e5e";
        c.fillRect(p.x + 4, p.y + p.h - 17, p.w - 8, 2);
        if (p.itemImg) {
          const bob = Math.floor(this.time * 2) % 2;
          c.drawImage(p.itemImg, Math.round(p.x + p.w / 2 - 16), Math.round(p.y + p.h - 48 + bob), 32, 32);
        }
        if (p.itemSlug && p.price) {
          const coin = env.coins;
          if (coin) c.drawImage(coin, 0, 0, 32, 32, Math.round(p.x + p.w / 2 - 22), Math.round(p.y + p.h - 4), 16, 16);
          c.fillStyle = "#f2d75e";
          c.font = "8px 'Press Start 2P', monospace";
          c.textAlign = "left";
          c.fillText(`${p.price}`, p.x + p.w / 2 - 4, p.y + p.h + 8);
          c.textAlign = "center";
        }
        break;
      }
    }
  }

  private drawBeam(c: CanvasRenderingContext2D, beam: Beam) {
    const isBrim = beam.duration > 0.3;
    const sheet = this.assets?.env.laser;
    const brimAnim = this.assets?.brimAnim?.LargeRedLaser;

    // the game's laser sheet is grayscale — the anm2 applies RedTint=255,
    // GreenTint=0, BlueTint=0; reproduce that with a cached multiply pass
    if (isBrim && sheet && !this.redLaser) this.redLaser = redTintCanvas(sheet);
    const impactSheetRaw = this.assets?.env.laserimpact;
    if (isBrim && impactSheetRaw && !this.redImpact) this.redImpact = redTintCanvas(impactSheetRaw);

    if (isBrim && sheet && brimAnim) {
      // Real Brimstone: mouth cap ("tip") + tiled pillar ("laser" layer),
      // animated with the game's own 4-frame loop, grow-in then fade-out.
      const frameIdx = Math.floor(this.time * ANM_FPS) % 4;
      const tipFrames = brimAnim.find((l) => l.layer === "tip")?.frames;
      const bodyFrames = brimAnim.find((l) => l.layer === "laser")?.frames;
      const tip = tipFrames?.[frameIdx % (tipFrames.length || 1)];
      const body = bodyFrames?.[frameIdx % (bodyFrames.length || 1)];
      if (tip && body) {
        const src = this.redLaser ?? sheet;
        const growIn = Math.min(1, beam.t / 0.07); // pillar extends from the mouth
        const fadeOut = beam.t > beam.duration - 0.15 ? (beam.duration - beam.t) / 0.15 : 1;
        const len = beam.len * growIn;
        c.save();
        c.globalAlpha = Math.max(0, fadeOut);
        c.translate(Math.round(beam.x), Math.round(beam.y));
        // rotate so the beam's local +Y axis points along the fire direction
        c.rotate(Math.atan2(beam.dir.y, beam.dir.x) - Math.PI / 2);
        const pulse = 1 + Math.sin(this.time * 24) * 0.06;
        const w = 32 * 1.35 * pulse; // thicker, rounder pillar
        // tiled body segments (64px source slices)
        for (let seg = 0; seg < len; seg += 60) {
          const segH = Math.min(64, ((len - seg) / 60) * 64);
          c.drawImage(src, body.x, body.y, body.w, (segH / 64) * body.h, -w / 2, seg, w, segH);
        }
        // mouth cap on top of the pillar start
        c.drawImage(src, tip.x, tip.y, tip.w, tip.h, -w / 2, -10, w, 34);
        // animated impact splat at the far end
        const impact = this.assets?.brimImpact?.Loop?.[0]?.frames;
        const impactSheet = this.redImpact ?? impactSheetRaw;
        if (impact && impactSheet && growIn >= 1) {
          const f = impact[frameIdx % impact.length];
          c.drawImage(impactSheet, f.x, f.y, f.w, f.h, -f.w / 2 - 4, len - f.h / 2, f.w + 8, f.h);
        }
        c.restore();
        return;
      }
    }

    // fallback / technology laser: layered stroke beam
    const fade = 1 - beam.t / beam.duration;
    const width = isBrim ? 18 * Math.min(1, fade + 0.4) : 4;
    const pulse = Math.floor(this.time * 20) % 2 === 0 ? 1 : 0.85;
    const ex = beam.x + beam.dir.x * beam.len;
    const ey = beam.y + beam.dir.y * beam.len;
    c.save();
    c.lineCap = "round";
    c.globalAlpha = Math.min(1, fade * 1.5);
    c.strokeStyle = isBrim ? "rgba(168,27,37,0.5)" : "rgba(120,180,255,0.4)";
    c.lineWidth = width + 6;
    c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = isBrim ? `rgba(224,58,47,${pulse})` : `rgba(190,225,255,${pulse})`;
    c.lineWidth = width;
    c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = isBrim ? "#ffb0a0" : "#ffffff";
    c.lineWidth = Math.max(1, width / 3);
    c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = isBrim ? "#ff5240" : "#cfe6ff";
    c.beginPath(); c.arc(ex, ey, (isBrim ? 8 : 4) * pulse, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  private drawExplosion(c: CanvasRenderingContext2D, ex: Explosion) {
    const sheet = this.assets?.env.explosion;
    const frames = this.assets?.explosionAnim?.Explosion?.[0]?.frames;
    if (sheet && frames && frames.length > 0) {
      const idx = Math.min(frames.length - 1, Math.floor((ex.t / 0.5) * frames.length));
      const f = frames[idx];
      c.drawImage(sheet, f.x, f.y, f.w, f.h, Math.round(ex.x - f.px), Math.round(ex.y - f.py), f.w, f.h);
    } else {
      const r = 14 + ex.t * 70;
      c.globalAlpha = 1 - ex.t * 2;
      c.fillStyle = "#f2b134";
      c.beginPath(); c.arc(ex.x, ex.y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e04a3f";
      c.beginPath(); c.arc(ex.x, ex.y, r * 0.6, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
  }

  private drawRing(c: CanvasRenderingContext2D, ring: Ring) {
    c.save();
    c.strokeStyle = "rgba(190,225,255,0.9)";
    c.lineWidth = 3;
    c.beginPath(); c.arc(Math.round(ring.x), Math.round(ring.y), ring.radius, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(120,180,255,0.4)";
    c.lineWidth = 7;
    c.beginPath(); c.arc(Math.round(ring.x), Math.round(ring.y), ring.radius, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  private drawSwing(c: CanvasRenderingContext2D, s: Swing) {
    const a0 = Math.atan2(s.dir.y, s.dir.x) - 0.9;
    const a1 = Math.atan2(s.dir.y, s.dir.x) + 0.9;
    c.save();
    c.globalAlpha = s.t / 0.18;
    c.strokeStyle = "#dfe6f0";
    c.lineWidth = 5;
    c.beginPath(); c.arc(this.px, this.py - 8, 34, a0, a1); c.stroke();
    c.strokeStyle = "#9ecbff";
    c.lineWidth = 2;
    c.beginPath(); c.arc(this.px, this.py - 8, 38, a0, a1); c.stroke();
    c.restore();
  }

  private drawCrosshair(c: CanvasRenderingContext2D, m: Missile) {
    const blink = Math.floor(this.time * 8) % 2 === 0;
    c.strokeStyle = blink ? "#ff4438" : "#c22026";
    c.lineWidth = 2;
    const r = 10 + m.t * 6;
    c.beginPath(); c.arc(m.x, m.y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(m.x - r - 5, m.y); c.lineTo(m.x + r + 5, m.y); c.stroke();
    c.beginPath(); c.moveTo(m.x, m.y - r - 5); c.lineTo(m.x, m.y + r + 5); c.stroke();
  }

  private drawFamiliar(c: CanvasRenderingContext2D, f: Familiar) {
    const img = this.assets?.env.incubus;
    const x = Math.round(f.x);
    const y = Math.round(f.y + Math.sin(this.time * 4) * 2);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(x, Math.round(f.y) + 8, 7, 2, 0, 0, Math.PI * 2); c.fill();
    if (img) {
      c.drawImage(img, 0, 0, 32, 32, x - 16, y - 24, 32, 32);
    } else {
      c.fillStyle = "#3a2b4a";
      c.fillRect(x - 6, y - 18, 12, 14);
    }
  }

  private drawKnife(c: CanvasRenderingContext2D, k: Knife) {
    const kx = Math.round(this.px + k.angle.x * k.dist);
    const ky = Math.round(this.py - 10 + k.angle.y * k.dist);
    c.save();
    c.translate(kx, ky);
    c.rotate(Math.atan2(k.angle.y, k.angle.x) + Math.PI / 4 + (k.state === "held" ? 0 : this.time * 2));
    c.fillStyle = "#cfd6de";
    c.fillRect(-2, -10, 4, 14);
    c.fillStyle = "#8a919c";
    c.fillRect(-1, -10, 2, 14);
    c.fillStyle = "#5a3d26";
    c.fillRect(-2, 4, 4, 6);
    c.restore();
  }

  private drawBomb(c: CanvasRenderingContext2D, b: Bomb) {
    const img = this.assets?.env.bomb;
    const blink = b.fuse < 0.5 && Math.floor(this.time * 12) % 2 === 0;
    if (img && !blink) {
      c.drawImage(img, 0, 0, 32, 32, Math.round(b.x - 16), Math.round(b.y - 24), 32, 32);
    } else {
      c.fillStyle = blink ? "#e04a3f" : "#2b2233";
      c.beginPath();
      c.arc(Math.round(b.x), Math.round(b.y - 6), 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#c9a227";
      c.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 18, 2, 6);
    }
  }

  // ---------------------------------------------------------------- player
  private animFrame(anim: { layer: string; frames: Anm2Frame[] }[] | undefined, layer: string, t: number, freeze = false): Anm2Frame | null {
    const la = anim?.find((l) => l.layer === layer) ?? anim?.[0];
    if (!la || la.frames.length === 0) return null;
    const total = la.frames.reduce((s, f) => s + f.delay, 0);
    let tick = freeze ? 0 : Math.floor(t * ANM_FPS) % Math.max(1, total);
    for (const f of la.frames) {
      tick -= f.delay;
      if (tick < 0) return f;
    }
    return la.frames[la.frames.length - 1];
  }

  private drawAnm2Frame(
    c: CanvasRenderingContext2D,
    sheet: HTMLImageElement | HTMLCanvasElement,
    f: Anm2Frame,
    ox: number,
    oy: number,
    scale: number,
  ) {
    c.save();
    c.translate(Math.round(ox + f.ox * scale), Math.round(oy + f.oy * scale));
    if (f.flipX) c.scale(-1, 1);
    c.scale(scale, scale);
    c.drawImage(sheet, f.x, f.y, f.w, f.h, -f.px, -f.py, f.w, f.h);
    c.restore();
  }

  /** Costume-style tint (Brimstone turns Isaac blood-red, etc.), cached. */
  private tintSheet(): HTMLImageElement | HTMLCanvasElement | null {
    if (!this.playerSheet) return null;
    const tint = this.params.combat.tint;
    if (!tint) return this.playerSheet;
    const key = `${this.playerKey}|${tint}`;
    if (this.tintedKey === key && this.tintedSheet) return this.tintedSheet;
    const off = document.createElement("canvas");
    off.width = this.playerSheet.width;
    off.height = this.playerSheet.height;
    const oc = off.getContext("2d")!;
    oc.drawImage(this.playerSheet, 0, 0);
    oc.globalCompositeOperation = "multiply";
    oc.fillStyle = tint;
    oc.fillRect(0, 0, off.width, off.height);
    oc.globalCompositeOperation = "destination-in";
    oc.drawImage(this.playerSheet, 0, 0);
    this.tintedSheet = off;
    this.tintedKey = key;
    return off;
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const flight = this.params.combat.flight;
    const lift = flight ? 5 + Math.round(Math.sin(this.time * 4) * 2) : 0;
    const scale = this.params.combat.sizeUp ? 1.18 : 1;
    // grounded characters sink 2px so their feet visually plant on the floor
    const groundNudge = flight ? 0 : 2;
    const x = Math.round(this.px);
    const y = Math.round(this.py - lift) + groundNudge;

    // grounded: small tight shadow under the feet (light source is above);
    // flight: shadow stays on the floor while the body hovers over it
    c.fillStyle = flight ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(x, Math.round(this.py) + 9, flight ? 8 : 6.5 * scale, flight ? 2.5 : 2, 0, 0, Math.PI * 2);
    c.fill();

    const anim = this.assets?.playerAnim;
    const sheet = this.tintSheet();
    if (sheet && anim) {
      // real .anm2 rendering: body layer + head layer
      const walkDir =
        Math.abs(this.moveDir.x) >= Math.abs(this.moveDir.y)
          ? this.moveDir.x < 0 ? "Left" : "Right"
          : this.moveDir.y < 0 ? "Up" : "Down";
      const body = this.animFrame(anim[`Walk${walkDir}`], "body", this.walkTime, !this.walking);
      if (body) this.drawAnm2Frame(c, sheet, body, x, y, scale);

      if (this.headSheet && this.headAnim) {
        // custom head (Azazel horns etc.) from its own anm2 — with the real
        // Charge/Shoot pose variants when they exist
        const suffix =
          this.brimCharge > 0.05 || this.shotCharge > 0.05
            ? this.brimCharge >= 0.95 ? "ChargeFull" : "Charge"
            : this.fireFlash > 0 ? "Shoot" : "";
        const headLayers =
          this.headAnim[`Head${this.headDir}${suffix}`] ?? this.headAnim[`Head${this.headDir}`];
        const f = headLayers?.find((l) => l.layer === "head")?.frames?.[0] ?? headLayers?.[0]?.frames?.[0];
        if (f) this.drawAnm2Frame(c, this.headSheet, f, x, y, scale);
      } else {
        const headAnim = anim[`Head${this.headDir}`];
        const headFrames = headAnim?.find((l) => l.layer === "head")?.frames;
        const head =
          this.fireFlash > 0 && headFrames && headFrames.length > 1
            ? headFrames[1]
            : headFrames?.[0] ?? null;
        if (head) this.drawAnm2Frame(c, sheet, head, x, y, scale);
      }
    } else if (this.playerPortrait) {
      // fallback: portrait sprite, bottom pinned to the feet line (py + 9)
      const img = this.playerPortrait;
      const bob = this.walking ? [0, 1, 0, -1][Math.floor(this.time * 10) % 4] : [0, 0, 1, 1][Math.floor(this.time * 3) % 4];
      const h = 40;
      const w = Math.max(18, Math.round((img.width / img.height) * h));
      c.save();
      c.translate(x, y + bob);
      if (this.headDir === "Left" || this.moveDir.x < 0) c.scale(-1, 1);
      c.drawImage(img, Math.round((-w / 2) * scale), Math.round(9 - h * scale), Math.round(w * scale), Math.round(h * scale));
      c.restore();
    } else {
      c.fillStyle = "#e8ddc4";
      c.fillRect(x - 8, y - 24, 16, 16);
      c.fillStyle = "#c9b8a0";
      c.fillRect(x - 5, y - 8, 10, 12);
    }

    // Holy Mantle shield bubble
    if (this.shieldUp) {
      c.save();
      c.globalAlpha = 0.5 + Math.sin(this.time * 5) * 0.15;
      c.strokeStyle = "#9ecbff";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x, y - 10, 16 * scale, 20 * scale, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    if (this.holdItem?.img) {
      c.drawImage(this.holdItem.img, x - 16, y - 62, 32, 32);
    }
  }

  private drawTear(c: CanvasRenderingContext2D, t: Tear) {
    const atlas = this.assets?.env.tears;
    const tearAnim = this.assets?.tearAnim;
    const poof = this.assets?.env.tearpoof;
    // ballistic drop-off shared with the hitbox (tearLift): slight rise,
    // then the tear falls to the floor at range end (lobs arc much higher)
    const lift = tearLift(t);
    const x = Math.round(t.x);
    const y = Math.round(t.y - lift);
    // shadow tracks the ground position while airborne
    if (t.splash < 0) {
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse(x, Math.round(t.y) + 4, 3, 1.5, 0, 0, Math.PI * 2);
      c.fill();
    }

    if (t.splash >= 0) {
      const frame = Math.floor(t.splash / 0.075);
      if (poof) {
        const col = Math.min(3, frame);
        c.drawImage(poof, col * 64, 0, 64, 64, x - 24, y - 24, 48, 48);
      } else {
        c.fillStyle = "#9db4d8";
        if (frame === 0) c.fillRect(x - 3, y - 3, 6, 6);
        else if (frame === 1) {
          c.fillRect(x - 5, y - 1, 3, 3);
          c.fillRect(x + 2, y - 1, 3, 3);
          c.fillRect(x - 1, y - 5, 3, 3);
          c.fillRect(x - 1, y + 2, 3, 3);
        } else {
          c.fillRect(x - 6, y - 6, 2, 2);
          c.fillRect(x + 4, y - 6, 2, 2);
          c.fillRect(x - 6, y + 4, 2, 2);
          c.fillRect(x + 4, y + 4, 2, 2);
        }
      }
      return;
    }

    // Ghost Pepper / Bird's Eye flames: animated fire projectile
    if (t.flame) {
      const fl = Math.floor(this.time * 12) % 2;
      c.fillStyle = fl ? "#d9531e" : "#f2b134";
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = fl ? "#f2b134" : "#ffe9a8";
      c.beginPath(); c.arc(x, y - 2, 3, 0, Math.PI * 2); c.fill();
      return;
    }

    if (atlas && tearAnim) {
      // size variant from damage: the game scales tears with damage ups
      const idx = this.params.tags.has("tiny_tears")
        ? 3
        : Math.max(4, Math.min(12, Math.round(4 + (t.damage - 3.5) * 0.6)));
      const frames = tearAnim[`RegularTear${idx}`]?.[0]?.frames;
      const f = frames?.[0];
      if (f) {
        c.drawImage(atlas, f.x, f.y, f.w, f.h, x - Math.round(f.w / 2), y - Math.round(f.h / 2), f.w, f.h);
        return;
      }
    }
    const laser = this.params.tags.has("laser");
    c.fillStyle = laser ? "#e04a3f" : "#b9c6d8";
    c.beginPath();
    c.arc(x, y, this.params.tags.has("tiny_tears") ? 2 : 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = laser ? "#f2a09c" : "#e8f0fa";
    c.fillRect(x - 1, y - 2, 2, 2);
  }
}
