/**
 * Loader for locally-imported game assets (public/assets/, gitignored).
 * Everything is optional: when a file is missing the engine falls back to
 * its original drawn-art path, so the deployed site (which ships NO game
 * assets) still works.
 */

export interface Anm2Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
  ox: number;
  oy: number;
  delay: number;
  flipX: boolean;
}
export type Anm2Data = Record<string, { layer: string; frames: Anm2Frame[] }[]>;

export interface GameAssets {
  env: Partial<Record<EnvName, HTMLImageElement>>;
  playerAnim: Anm2Data | null;
  tearAnim: Anm2Data | null;
  brimAnim: Anm2Data | null;
  brimImpact: Anm2Data | null;
  explosionAnim: Anm2Data | null;
}

export type EnvName =
  | "basement_walls"
  | "basement_nfloor"
  | "shop_walls"
  | "shop_nfloor"
  | "rocks"
  | "poop"
  | "spikes"
  | "fireplace"
  | "tnt"
  | "props"
  | "tears"
  | "tearpoof"
  | "bomb"
  | "hearts"
  | "coins"
  | "punchingbag"
  | "laser"
  | "laserimpact"
  | "explosion"
  | "incubus"
  | "knife2";

const ENV_NAMES: EnvName[] = [
  "basement_walls", "basement_nfloor", "shop_walls", "shop_nfloor",
  "rocks", "poop", "spikes", "fireplace", "tnt", "props",
  "tears", "tearpoof", "bomb", "hearts", "coins", "punchingbag",
  "laser", "laserimpact", "explosion", "incubus", "knife2",
];

const BASE = import.meta.env.BASE_URL;

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

/** First candidate that actually loads, else null. */
export async function loadFirst(urls: string[]): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    const img = await loadImage(url);
    if (img) return img;
  }
  return null;
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let cached: Promise<GameAssets> | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  cached ??= (async () => {
    const env: GameAssets["env"] = {};
    await Promise.all(
      ENV_NAMES.map(async (name) => {
        const img = await loadImage(`${BASE}assets/env/${name}.png`);
        if (img) env[name] = img;
      }),
    );
    const [playerAnim, tearAnim, brimAnim, brimImpact, explosionAnim] = await Promise.all([
      loadJson<Anm2Data>(`${BASE}assets/anim/player.json`),
      loadJson<Anm2Data>(`${BASE}assets/anim/tear.json`),
      loadJson<Anm2Data>(`${BASE}assets/anim/brimstone.json`),
      loadJson<Anm2Data>(`${BASE}assets/anim/brimimpact.json`),
      loadJson<Anm2Data>(`${BASE}assets/anim/explosion.json`),
    ]);
    return { env, playerAnim, tearAnim, brimAnim, brimImpact, explosionAnim };
  })();
  return cached;
}

export function characterSheetUrl(slug: string): string {
  return `${BASE}assets/characters/${slug}/sheet.png`;
}

export interface CharacterLook {
  sheet: HTMLImageElement | HTMLCanvasElement | null;
  /** Custom head (Azazel/Bethany/Jacob) rendered from its own anm2 layout. */
  headSheet: HTMLImageElement | null;
  headAnim: Anm2Data | null;
}

/**
 * Full character look = skin sheet + grid-aligned costume overlays (hair,
 * eyepatch…) composited on a canvas, plus an optional custom-head sheet
 * with its own frame data — the same layering the game does.
 */
export async function loadCharacterLook(slug: string): Promise<CharacterLook> {
  const dir = `${BASE}assets/characters/${slug}`;
  const base = await loadImage(`${dir}/sheet.png`);
  if (!base) return { sheet: null, headSheet: null, headAnim: null };

  let manifest: { overlays?: number; head?: boolean } = {};
  try {
    const res = await fetch(`${dir}/manifest.json`);
    if (res.ok) manifest = await res.json();
  } catch {
    /* no manifest — skin only */
  }

  let sheet: HTMLImageElement | HTMLCanvasElement = base;
  const count = manifest.overlays ?? 0;
  if (count > 0) {
    const overlays = await Promise.all(
      Array.from({ length: count }, (_, i) => loadImage(`${dir}/overlay_${i}.png`)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    for (const overlay of overlays) if (overlay) ctx.drawImage(overlay, 0, 0);
    sheet = canvas;
  }

  const [headSheet, headAnim] = manifest.head
    ? await Promise.all([
        loadImage(`${dir}/headsheet.png`),
        loadJson<Anm2Data>(`${dir}/headanim.json`),
      ])
    : [null, null];

  return { sheet, headSheet, headAnim };
}
