import type { Character, Item } from "./types";

/**
 * Local-first sprite resolution.
 *
 * scripts/import-local-assets.ts copies locally-extracted game sprites
 * (personal use only — the whole public/assets/ tree is gitignored and must
 * never be committed or deployed) to these deterministic paths. When a local
 * file is absent the <SpriteImg> component / canvas loader falls back to the
 * wiki-hosted URL from the scraped data.
 */
const BASE = import.meta.env.BASE_URL;

export function itemSpriteCandidates(item: Item): string[] {
  const candidates: string[] = [];
  if (item.id !== null) {
    const dir = item.type === "trinket" ? "trinkets" : "collectibles";
    candidates.push(`${BASE}assets/${dir}/${item.id}.png`);
  }
  if (item.imageUrl) candidates.push(item.imageUrl);
  return candidates;
}

export function characterPortraitCandidates(c: Character): string[] {
  const candidates: string[] = [`${BASE}assets/characters/${c.slug}/portrait.png`];
  if (c.imageUrl) candidates.push(c.imageUrl);
  return candidates;
}

/** Player spritesheet (walk/head frames) — local only, no wiki equivalent. */
export function characterSheetUrl(c: Character): string {
  return `${BASE}assets/characters/${c.slug}/sheet.png`;
}

/** Environment/canvas art (backdrop, props, tears, hearts) — local only. */
export function envAssetUrl(name: string): string {
  return `${BASE}assets/env/${name}`;
}

/** Parsed player .anm2 frame data emitted by the import script. */
export function playerAnimUrl(): string {
  return `${BASE}assets/anim/player.json`;
}
