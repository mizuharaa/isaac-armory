import charactersJson from "../../data/characters.json";
import itemsJson from "../../data/items.json";
import poolsJson from "../../data/pools.json";
import trinketsJson from "../../data/trinkets.json";
import type { Character, Item, Pool } from "./types";

export const items = itemsJson as unknown as Item[];
export const trinkets = trinketsJson as unknown as Item[];
export const characters = charactersJson as unknown as Character[];
export const pools = poolsJson as unknown as Pool[];

/** Items + trinkets — what the Armory browses. */
export const allItems: Item[] = [...items, ...trinkets];

export const itemBySlug = new Map(allItems.map((i) => [i.slug, i]));
export const characterBySlug = new Map(characters.map((c) => [c.slug, c]));
export const poolBySlug = new Map(pools.map((p) => [p.slug, p]));

export const regularCharacters = characters.filter((c) => !c.tainted);
export const taintedCharacters = characters.filter((c) => c.tainted);

/** Rough "how much does this item move stats" score for the impact sort. */
export function statImpact(item: Item): number {
  let score = 0;
  for (const [key, value] of Object.entries(item.statModifiers)) {
    if (typeof value !== "number") continue;
    score += key.endsWith("Mult") ? Math.abs(1 - value) * 4 : Math.abs(value);
  }
  return score;
}
