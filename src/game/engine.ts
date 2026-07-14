/**
 * Playground engine: fixed-timestep (60 Hz) top-down sandbox in a 480×270
 * logical canvas, integer-scaled with imageSmoothingEnabled = false.
 *
 * Real art policy: the player and pedestal items draw the actual game
 * sprites hot-loaded from the wiki. Room tiles/props (rocks, poop, spikes,
 * fires, TNT, the punching-bag dummy) are original vector-pixel drawings in
 * the game's palette — the game's own tile sheets are not redistributable.
 */

export const VIEW_W = 480;
export const VIEW_H = 270;
const WALL = 26;
const TICK = 1 / 60;

export interface GameParams {
  /** px/s at speed stat 1.0 is 90. */
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
  solid: boolean;
  /** pedestal payload */
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
  splash: number; // -1 = flying, >=0 splash frame timer
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

function makeMainRoom(): Prop[] {
  return [
    { kind: "rock", x: 120, y: 70, w: 22, h: 22, hp: 1, solid: true },
    { kind: "rock", x: 146, y: 70, w: 22, h: 22, hp: 1, solid: true },
    { kind: "rock", x: 120, y: 96, w: 22, h: 22, hp: 1, solid: true },
    { kind: "poop", x: 300, y: 80, w: 22, h: 22, hp: 3, solid: true },
    { kind: "poop", x: 210, y: 190, w: 22, h: 22, hp: 3, solid: true },
    { kind: "spike", x: 250, y: 120, w: 24, h: 24, hp: Infinity, solid: false },
    { kind: "spike", x: 274, y: 120, w: 24, h: 24, hp: Infinity, solid: false },
    { kind: "fire", x: 70, y: 190, w: 20, h: 22, hp: 2, solid: true },
    { kind: "fire", x: 390, y: 60, w: 20, h: 22, hp: 2, solid: true },
    { kind: "tnt", x: 340, y: 200, w: 20, h: 24, hp: 1, solid: true },
    { kind: "dummy", x: 410, y: 130, w: 26, h: 40, hp: Infinity, solid: true },
  ];
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private params: GameParams = {
    speed: 1,
    fireDelay: 10,
    damage: 3.5,
    range: 6.5,
    shotSpeed: 1,
    tags: new Set(),
  };
  private playerImg: HTMLImageElement | null = null;

  // player state
  private px = VIEW_W / 2;
  private py = VIEW_H / 2 + 40;
  private facing: 1 | -1 = 1;
  private walking = false;
  private fireCooldown = 0;
  private hurtFlash = 0;
  private holdItem: { img: HTMLImageElement | null; name: string; t: number } | null = null;

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

  /** rolling 3 s damage window on the dummy */
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

  setParams(p: GameParams) {
    this.params = p;
  }
  /** UI overlays pause the simulation (also happens on tab blur). */
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) this.last = performance.now();
    this.keys.clear();
  }
  setPlayerImage(img: HTMLImageElement | null) {
    this.playerImg = img;
  }
  setShopPedestals(pedestals: { slug: string; img: HTMLImageElement | null; price: number }[]) {
    this.rooms.shop = pedestals.map((p, i) => ({
      kind: "pedestal" as const,
      x: 120 + i * 90,
      y: 92,
      w: 24,
      h: 26,
      hp: Infinity,
      solid: false,
      itemSlug: p.slug,
      itemImg: p.img ?? undefined,
      price: p.price,
    }));
  }
  /** Debug spawner: put an item pedestal into the current room near center. */
  spawnPedestal(slug: string, img: HTMLImageElement | null) {
    const props = this.rooms[this.room];
    const n = props.filter((p) => p.kind === "pedestal" && !p.dead).length;
    props.push({
      kind: "pedestal",
      x: 150 + (n % 4) * 46,
      y: 140 + Math.floor(n / 4) * 40,
      w: 24,
      h: 26,
      hp: Infinity,
      solid: false,
      itemSlug: slug,
      itemImg: img ?? undefined,
    });
  }
  kick() {
    this.shake = Math.max(this.shake, 4);
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

    // movement (8-directional)
    let dx = 0;
    let dy = 0;
    if (this.keys.has("w")) dy -= 1;
    if (this.keys.has("s")) dy += 1;
    if (this.keys.has("a")) dx -= 1;
    if (this.keys.has("d")) dx += 1;
    this.walking = dx !== 0 || dy !== 0;
    if (this.walking) {
      const len = Math.hypot(dx, dy);
      const v = (p.speed * 90) / len;
      const nx = this.px + dx * v * dt;
      const ny = this.py + dy * v * dt;
      if (!this.collides(nx, this.py, flight)) this.px = nx;
      if (!this.collides(this.px, ny, flight)) this.py = ny;
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    }
    this.px = Math.max(WALL + 8, Math.min(VIEW_W - WALL - 8, this.px));
    this.py = Math.max(WALL + 10, Math.min(VIEW_H - WALL - 10, this.py));

    // doors
    this.checkDoors();

    // firing (4-directional, arrow keys — the game's control scheme)
    this.fireCooldown -= dt;
    let fx = 0;
    let fy = 0;
    if (this.keys.has("ArrowUp")) fy = -1;
    else if (this.keys.has("ArrowDown")) fy = 1;
    else if (this.keys.has("ArrowLeft")) fx = -1;
    else if (this.keys.has("ArrowRight")) fx = 1;
    if ((fx || fy) && this.fireCooldown <= 0) {
      this.fireCooldown = (p.fireDelay + 1) / 30;
      const speed = 140 * p.shotSpeed;
      this.tears.push({
        x: this.px + fx * 8,
        y: this.py - 6 + fy * 8,
        vx: fx * speed + (this.walking ? 0 : 0),
        vy: fy * speed,
        traveled: 0,
        max: p.range * 26,
        damage: p.damage,
        splash: -1,
      });
      if (fx !== 0) this.facing = fx > 0 ? 1 : -1;
    }

    // tears
    for (const t of this.tears) {
      if (t.splash >= 0) {
        t.splash += dt;
        continue;
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.traveled += Math.hypot(t.vx, t.vy) * dt;
      if (t.traveled >= t.max || this.tearHit(t)) t.splash = 0;
    }
    this.tears = this.tears.filter((t) => t.splash < 0.24);

    // bombs
    for (const b of this.bombs) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b.x, b.y);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);

    // hazards under the player
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

    // pedestals → pickup
    for (const prop of this.props()) {
      if (prop.dead || prop.kind !== "pedestal" || !prop.itemSlug) continue;
      if (this.overlap(this.px, this.py, 8, prop)) {
        this.holdItem = { img: prop.itemImg ?? null, name: prop.itemSlug, t: 0.5 };
        this.onPickup(prop.itemSlug);
        this.texts.push({
          x: prop.x + prop.w / 2,
          y: prop.y - 8,
          text: prop.price ? `-${prop.price}¢` : "picked up!",
          age: 0,
          color: "#c9a227",
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

    // floating texts, dummy dps window, shake decay
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
      if (this.overlap(x, y, 7, p)) return true;
    }
    return false;
  }

  private overlap(x: number, y: number, r: number, p: Prop): boolean {
    return x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h;
  }

  private checkDoors() {
    // main room: door in the top wall → shop; shop: bottom door → main
    const doorX = Math.abs(this.px - VIEW_W / 2) < 18;
    if (this.room === "main" && doorX && this.py <= WALL + 11) {
      this.room = "shop";
      this.py = VIEW_H - WALL - 16;
      this.onRoomChange(this.room);
    } else if (this.room === "shop" && doorX && this.py >= VIEW_H - WALL - 11) {
      this.room = "main";
      this.py = WALL + 16;
      this.onRoomChange(this.room);
    }
  }

  private tearHit(t: Tear): boolean {
    for (const p of this.props()) {
      if (p.dead || p.kind === "spike" || p.kind === "pedestal") continue;
      if (t.x > p.x && t.x < p.x + p.w && t.y > p.y && t.y < p.y + p.h) {
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
        x: p.x + p.w / 2 + (Math.random() * 10 - 5),
        y: p.y - 4,
        text: damage.toFixed(1),
        age: 0,
        color: "#e8ddc4",
      });
      return;
    }
    if (p.kind === "rock" && fromTear) return; // rocks need bombs
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
    this.texts.push({ x, y: y - 6, text: "BOOM", age: 0, color: "#d9534f" });
    for (const p of this.props()) {
      if (p.dead) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if (Math.hypot(cx - x, cy - y) < 46) {
        if (p.kind === "dummy") this.damageProp(p, 60, false);
        else if (p.kind !== "pedestal" && p.kind !== "spike") {
          if (p.kind === "tnt" && !p.dead) {
            p.dead = true;
            p.solid = false;
            this.explode(cx, cy);
          } else {
            p.dead = true;
            p.solid = false;
          }
        }
      }
    }
    if (Math.hypot(this.px - x, this.py - y) < 46) this.hurtFlash = 0.5;
  }

  // ------------------------------------------------------------------ render
  private render() {
    const c = this.ctx;
    c.save();
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.shake > 0) {
      c.translate(
        Math.round((Math.random() * 2 - 1) * this.shake * 0.5),
        Math.round((Math.random() * 2 - 1) * this.shake * 0.5),
      );
    }

    this.drawRoom(c);
    for (const p of this.props()) this.drawProp(c, p);
    for (const b of this.bombs) this.drawBomb(c, b);
    this.drawPlayer(c);
    for (const t of this.tears) this.drawTear(c, t);

    // floating texts
    c.font = "8px monospace";
    c.textAlign = "center";
    for (const ft of this.texts) {
      c.fillStyle = ft.color;
      c.globalAlpha = 1 - ft.age;
      c.fillText(ft.text, Math.round(ft.x), Math.round(ft.y - ft.age * 14));
      c.globalAlpha = 1;
    }

    // dummy DPS readout
    if (this.room === "main") {
      const dummy = this.props().find((p) => p.kind === "dummy");
      if (dummy) {
        c.fillStyle = "#c9a227";
        c.fillText(`DPS ${this.dummyDps.toFixed(1)}`, dummy.x + dummy.w / 2, dummy.y - 12);
      }
    }
    if (this.room === "shop") {
      c.fillStyle = "#9b8a72";
      c.fillText("THE SHOP — walk over an item to take it", VIEW_W / 2, WALL + 14);
    }

    if (this.hurtFlash > 0) {
      c.fillStyle = `rgba(179,32,42,${this.hurtFlash * 0.4})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.fillStyle = "#e8ddc4";
      c.font = "10px monospace";
      c.fillText("PAUSED — click to focus", VIEW_W / 2, VIEW_H / 2);
    }
    c.restore();
  }

  private drawRoom(c: CanvasRenderingContext2D) {
    // floor: two-tone stone checker
    for (let ty = 0; ty < VIEW_H / 30 + 1; ty++) {
      for (let tx = 0; tx < VIEW_W / 30 + 1; tx++) {
        c.fillStyle = (tx + ty) % 2 === 0 ? "#2a1f18" : "#251b15";
        c.fillRect(tx * 30, ty * 30, 30, 30);
      }
    }
    // faint cracks
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(90, 150, 14, 2);
    c.fillRect(320, 90, 2, 12);
    // walls
    c.fillStyle = "#171210";
    c.fillRect(0, 0, VIEW_W, WALL);
    c.fillRect(0, VIEW_H - WALL, VIEW_W, WALL);
    c.fillRect(0, 0, WALL, VIEW_H);
    c.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H);
    // wall stones
    c.fillStyle = "#332620";
    for (let x = 4; x < VIEW_W - 4; x += 24) {
      c.fillRect(x, 4, 18, WALL - 10);
      c.fillRect(x, VIEW_H - WALL + 6, 18, WALL - 10);
    }
    for (let y = 4; y < VIEW_H - 4; y += 24) {
      c.fillRect(4, y, WALL - 10, 18);
      c.fillRect(VIEW_W - WALL + 6, y, WALL - 10, 18);
    }
    // door
    const doorY = this.room === "main" ? 0 : VIEW_H - WALL;
    c.fillStyle = "#0d0a08";
    c.fillRect(VIEW_W / 2 - 16, doorY, 32, WALL);
    c.fillStyle = "#4a3628";
    c.fillRect(VIEW_W / 2 - 18, doorY + (this.room === "main" ? WALL - 4 : 0), 36, 4);
  }

  private drawProp(c: CanvasRenderingContext2D, p: Prop) {
    const jitter = p.anim ? Math.round(Math.sin(this.time * 60) * 1.5) : 0;
    const x = Math.round(p.x + jitter);
    const y = Math.round(p.y);
    if (p.dead) {
      if (p.kind === "poop") {
        c.fillStyle = "#4a3628";
        c.fillRect(x + 2, y + p.h - 6, p.w - 4, 4);
      } else if (p.kind !== "pedestal") {
        c.fillStyle = "#241a16";
        c.fillRect(x + 3, y + p.h - 8, p.w - 6, 6);
      }
      return;
    }
    switch (p.kind) {
      case "rock":
        c.fillStyle = "#5d5148";
        c.fillRect(x, y + 3, p.w, p.h - 3);
        c.fillStyle = "#77685c";
        c.fillRect(x + 2, y, p.w - 4, p.h - 6);
        c.fillStyle = "#493f38";
        c.fillRect(x + 4, y + p.h - 8, p.w - 8, 4);
        break;
      case "poop": {
        const shade = p.hp >= 3 ? "#7a5230" : p.hp === 2 ? "#6a4629" : "#553a22";
        c.fillStyle = shade;
        c.fillRect(x + 2, y + p.h - 8, p.w - 4, 8);
        if (p.hp >= 2) c.fillRect(x + 4, y + p.h - 14, p.w - 8, 7);
        if (p.hp >= 3) c.fillRect(x + 7, y + p.h - 19, p.w - 14, 6);
        break;
      }
      case "spike":
        c.fillStyle = "#3a3f45";
        for (let i = 0; i < 3; i++) {
          const sx = x + 2 + i * 8;
          c.beginPath();
          c.moveTo(sx, y + p.h - 2);
          c.lineTo(sx + 3, y + 4);
          c.lineTo(sx + 6, y + p.h - 2);
          c.closePath();
          c.fill();
        }
        break;
      case "fire": {
        const f = Math.floor(this.time * 8) % 2;
        c.fillStyle = "#3a2a20";
        c.fillRect(x, y + p.h - 6, p.w, 6);
        if (p.hp >= 1) {
          c.fillStyle = f ? "#d9531e" : "#c9a227";
          c.fillRect(x + 4, y + 6 - f * 2, p.w - 8, p.h - 12 + f * 2);
          c.fillStyle = f ? "#f2b134" : "#d9531e";
          c.fillRect(x + 7, y + 10 - f * 3, p.w - 14, p.h - 16 + f * 3);
        }
        if (p.hp === 1) c.globalAlpha = 1; // weakened fire drawn same, smaller inner flame handled above
        break;
      }
      case "tnt":
        c.fillStyle = "#8c2f2b";
        c.fillRect(x, y + 4, p.w, p.h - 4);
        c.fillStyle = "#a83a35";
        c.fillRect(x + 2, y + 6, p.w - 4, p.h - 10);
        c.fillStyle = "#e8ddc4";
        c.font = "8px monospace";
        c.textAlign = "center";
        c.fillText("TNT", x + p.w / 2, y + p.h - 8);
        break;
      case "dummy":
        // punching bag on a stand
        c.fillStyle = "#241a16";
        c.fillRect(x + p.w / 2 - 2, y + p.h - 10, 4, 10);
        c.fillStyle = "#6a4629";
        c.fillRect(x + 6, y + p.h - 12, p.w - 12, 4);
        c.fillStyle = "#7d7468";
        c.fillRect(x + 3, y, p.w - 6, p.h - 12);
        c.fillStyle = "#93887a";
        c.fillRect(x + 5, y + 2, p.w - 10, 8);
        c.fillStyle = "#5c0d10";
        c.fillRect(x + 3, y + 14, p.w - 6, 3);
        break;
      case "pedestal":
        c.fillStyle = "#5d5148";
        c.fillRect(x + 2, y + p.h - 8, p.w - 4, 8);
        c.fillStyle = "#77685c";
        c.fillRect(x, y + p.h - 12, p.w, 5);
        if (p.itemImg) {
          const bob = Math.floor(this.time * 2) % 2;
          c.drawImage(p.itemImg, x - 3, y - 18 + bob, 30, 30);
        }
        if (p.itemSlug && p.price) {
          c.fillStyle = "#c9a227";
          c.font = "8px monospace";
          c.textAlign = "center";
          c.fillText(`${p.price}¢`, x + p.w / 2, y + p.h + 9);
        }
        break;
    }
  }

  private drawBomb(c: CanvasRenderingContext2D, b: Bomb) {
    const blink = b.fuse < 0.5 && Math.floor(this.time * 12) % 2 === 0;
    c.fillStyle = blink ? "#d9534f" : "#2b2233";
    c.beginPath();
    c.arc(Math.round(b.x), Math.round(b.y), 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c9a227";
    c.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 11, 2, 5);
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const bob = this.walking
      ? [0, 1, 0, -1][Math.floor(this.time * 10) % 4]
      : [0, 0, 1, 1][Math.floor(this.time * 3) % 4];
    const x = Math.round(this.px);
    const y = Math.round(this.py + bob);

    // shadow (bigger offset when flying)
    const flight = this.params.tags.has("flight");
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(x, y + 16, 10, 3, 0, 0, Math.PI * 2);
    c.fill();

    const lift = flight ? 5 : 0;
    if (this.playerImg) {
      const img = this.playerImg;
      const h = 38;
      const w = Math.max(16, Math.round((img.width / img.height) * h));
      c.save();
      c.translate(x, y - lift);
      if (this.facing === -1) c.scale(-1, 1);
      // size-up costume cue for big damage multipliers
      const grow = this.params.tags.has("size_up") ? 1.18 : 1;
      c.drawImage(img, Math.round(-w / 2), Math.round(-h + 14), Math.round(w * grow), Math.round(h * grow));
      c.restore();
    } else {
      c.fillStyle = "#e8ddc4";
      c.fillRect(x - 7, y - 20 - lift, 14, 14);
      c.fillStyle = "#c9b8a0";
      c.fillRect(x - 4, y - 6 - lift, 8, 10);
    }

    // hold-above-head pose after pickup
    if (this.holdItem?.img) {
      c.drawImage(this.holdItem.img, x - 12, y - 52, 24, 24);
    }
  }

  private drawTear(c: CanvasRenderingContext2D, t: Tear) {
    const x = Math.round(t.x);
    const y = Math.round(t.y - Math.sin((t.traveled / t.max) * Math.PI) * 4);
    if (t.splash >= 0) {
      const frame = Math.floor(t.splash / 0.08);
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
      return;
    }
    const laser = this.params.tags.has("laser");
    c.fillStyle = laser ? "#d9534f" : "#b9c6d8";
    c.beginPath();
    c.arc(x, y, this.params.tags.has("tiny_tears") ? 2 : 3.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = laser ? "#f2a09c" : "#e8f0fa";
    c.fillRect(x - 1, y - 2, 2, 2);
  }
}
