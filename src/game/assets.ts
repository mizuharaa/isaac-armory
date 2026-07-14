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
  | "punchingbag";

const ENV_NAMES: EnvName[] = [
  "basement_walls", "basement_nfloor", "shop_walls", "shop_nfloor",
  "rocks", "poop", "spikes", "fireplace", "tnt", "props",
  "tears", "tearpoof", "bomb", "hearts", "coins", "punchingbag",
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
    const [playerAnim, tearAnim] = await Promise.all([
      loadJson<Anm2Data>(`${BASE}assets/anim/player.json`),
      loadJson<Anm2Data>(`${BASE}assets/anim/tear.json`),
    ]);
    return { env, playerAnim, tearAnim };
  })();
  return cached;
}

export function characterSheetUrl(slug: string): string {
  return `${BASE}assets/characters/${slug}/sheet.png`;
}
