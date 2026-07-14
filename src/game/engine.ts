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
import type { Anm2Data, Anm2Frame, GameAssets } from "./assets";

export const VIEW_W = 468;
export const VIEW_H = 312;
const WALL = 26;
const TICK = 1 / 60;
const ANM_FPS = 30;

export interface GameParams {
  speed: number;
  fireDelay: number;
  damage: number;
  range: number;
  shotSpeed: number;
  tags: Set<string>;
}

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
    at(14, 5, { kind: "dummy", w: G, h: 40, hp: Infinity, solid: true }),
  ];
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private assets: GameAssets | null = null;
  private params: GameParams = {
    speed: 1, fireDelay: 10, damage: 3.5, range: 6.5, shotSpeed: 1, tags: new Set(),
  };
  private playerSheet: HTMLImageElement | null = null;
  private playerPortrait: HTMLImageElement | null = null;

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
  private bombs: Bomb[] = [];
  private texts: FloatText[] = [];
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
  setPlayerSheet(sheet: HTMLImageElement | null, portrait: HTMLImageElement | null) {
    this.playerSheet = sheet;
    this.playerPortrait = portrait;
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
    const flight = p.tags.has("flight");

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
    if (fx || fy) {
      this.headDir = fy < 0 ? "Up" : fy > 0 ? "Down" : fx < 0 ? "Left" : "Right";
      if (this.fireCooldown <= 0) {
        this.fireCooldown = (p.fireDelay + 1) / 30;
        this.fireFlash = 0.12;
        const speed = 150 * p.shotSpeed;
        this.tears.push({
          x: this.px + fx * 9,
          y: this.py - 14 + fy * 9,
          vx: fx * speed,
          vy: fy * speed,
          traveled: 0,
          max: p.range * G,
          damage: p.damage,
          splash: -1,
        });
      }
    } else if (this.walking) {
      this.headDir =
        this.moveDir.y < 0 ? "Up" : this.moveDir.y > 0 ? "Down" : this.moveDir.x < 0 ? "Left" : "Right";
    }

    for (const t of this.tears) {
      if (t.splash >= 0) {
        t.splash += dt;
        continue;
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.traveled += Math.hypot(t.vx, t.vy) * dt;
      const inWall =
        t.x < WALL + 4 || t.x > VIEW_W - WALL - 4 || t.y < WALL + 4 || t.y > VIEW_H - WALL - 4;
      if (t.traveled >= t.max || inWall || this.tearHit(t)) t.splash = 0;
    }
    this.tears = this.tears.filter((t) => t.splash < 0.3);

    for (const b of this.bombs) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b.x, b.y);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);

    if (!flight) {
      for (const prop of this.props()) {
        if (prop.dead || (prop.kind !== "spike" && prop.kind !== "fire")) continue;
        if (this.overlap(this.px, this.py, 6, prop) && this.hurtFlash <= 0) {
          this.hurtFlash = 0.5;
          this.shake = 5;
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

  private tearHit(t: Tear): boolean {
    for (const p of this.props()) {
      if (p.dead || p.kind === "spike" || p.kind === "pedestal") continue;
      if (t.x > p.x && t.x < p.x + p.w && t.y > p.y - 8 && t.y < p.y + p.h) {
        this.damageProp(p, t.damage, true);
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

  private explode(x: number, y: number) {
    this.shake = 9;
    this.texts.push({ x, y: y - 6, text: "BOOM", age: 0, color: "#ff6a5e" });
    for (const p of this.props()) {
      if (p.dead) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if (Math.hypot(cx - x, cy - y) < 48) {
        if (p.kind === "dummy") this.damageProp(p, 60, false);
        else if (p.kind !== "pedestal" && p.kind !== "spike") {
          const wasTnt = p.kind === "tnt";
          p.dead = true;
          p.solid = false;
          if (wasTnt) this.explode(cx, cy);
        }
      }
    }
    if (Math.hypot(this.px - x, this.py - y) < 48) this.hurtFlash = 0.5;
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
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    for (const t of this.tears) this.drawTear(c, t);

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

  private drawAnm2Frame(c: CanvasRenderingContext2D, sheet: HTMLImageElement, f: Anm2Frame, ox: number, oy: number, scale: number) {
    c.save();
    c.translate(Math.round(ox + f.ox * scale), Math.round(oy + f.oy * scale));
    if (f.flipX) c.scale(-1, 1);
    c.scale(scale, scale);
    c.drawImage(f.x >= 0 ? sheet : sheet, f.x, f.y, f.w, f.h, -f.px, -f.py, f.w, f.h);
    c.restore();
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const flight = this.params.tags.has("flight");
    const lift = flight ? 4 + Math.round(Math.sin(this.time * 4)) : 0;
    const scale = this.params.tags.has("size_up") ? 1.18 : 1;
    const x = Math.round(this.px);
    const y = Math.round(this.py - lift);

    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(x, Math.round(this.py) + 8, 10, 3, 0, 0, Math.PI * 2);
    c.fill();

    const anim = this.assets?.playerAnim;
    if (this.playerSheet && anim) {
      // real .anm2 rendering: body layer + head layer
      const walkDir =
        Math.abs(this.moveDir.x) >= Math.abs(this.moveDir.y)
          ? this.moveDir.x < 0 ? "Left" : "Right"
          : this.moveDir.y < 0 ? "Up" : "Down";
      const body = this.animFrame(anim[`Walk${walkDir}`], "body", this.walkTime, !this.walking);
      const headAnim = anim[`Head${this.headDir}`];
      const headFrames = headAnim?.find((l) => l.layer === "head")?.frames;
      const head =
        this.fireFlash > 0 && headFrames && headFrames.length > 1
          ? headFrames[1]
          : headFrames?.[0] ?? null;
      if (body) this.drawAnm2Frame(c, this.playerSheet, body, x, y, scale);
      if (head) this.drawAnm2Frame(c, this.playerSheet, head, x, y, scale);
    } else if (this.playerPortrait) {
      // fallback: portrait sprite with the old bob animation
      const img = this.playerPortrait;
      const bob = this.walking ? [0, 1, 0, -1][Math.floor(this.time * 10) % 4] : [0, 0, 1, 1][Math.floor(this.time * 3) % 4];
      const h = 40;
      const w = Math.max(18, Math.round((img.width / img.height) * h));
      c.save();
      c.translate(x, y + bob);
      if (this.headDir === "Left" || this.moveDir.x < 0) c.scale(-1, 1);
      c.drawImage(img, Math.round((-w / 2) * scale), Math.round((-h + 12) * scale), Math.round(w * scale), Math.round(h * scale));
      c.restore();
    } else {
      c.fillStyle = "#e8ddc4";
      c.fillRect(x - 8, y - 24, 16, 16);
      c.fillStyle = "#c9b8a0";
      c.fillRect(x - 5, y - 8, 10, 12);
    }

    if (this.holdItem?.img) {
      c.drawImage(this.holdItem.img, x - 16, y - 62, 32, 32);
    }
  }

  private drawTear(c: CanvasRenderingContext2D, t: Tear) {
    const atlas = this.assets?.env.tears;
    const tearAnim = this.assets?.tearAnim;
    const poof = this.assets?.env.tearpoof;
    const x = Math.round(t.x);
    const y = Math.round(t.y - Math.sin(Math.min(1, t.traveled / t.max) * Math.PI) * 5);

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
