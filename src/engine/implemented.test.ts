/**
 * Guards the Working-filter registry against silent drift: every listed
 * slug must resolve to a real scraped item (this is exactly the bug that
 * shipped with "ludovico-technique" vs the real slug
 * "the-ludovico-technique" — the weapon mode never activated and nothing
 * caught it until a manual audit).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IMPLEMENTED_SLUGS } from "./implemented";

const dataFile = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../data", name), "utf8"));

describe("implemented-item registry integrity", () => {
  const items: any[] = dataFile("items.json");
  const trinkets: any[] = dataFile("trinkets.json");
  const allSlugs = new Set([...items, ...trinkets].map((i) => i.slug));

  it("every IMPLEMENTED_SLUGS entry resolves to a real scraped item", () => {
    const dangling = [...IMPLEMENTED_SLUGS].filter((s) => !allSlugs.has(s));
    expect(dangling).toEqual([]);
  });

  it("has a non-trivial number of entries (sanity check)", () => {
    expect(IMPLEMENTED_SLUGS.size).toBeGreaterThan(50);
  });
});
