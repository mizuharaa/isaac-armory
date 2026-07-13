/**
 * URL-safe slugs derived from wiki page titles. A few names are pure
 * punctuation ("???", "<3") and get explicit mappings.
 */
const SLUG_OVERRIDES: Record<string, string> = {
  "???": "blue-baby",
  "??? (Character)": "blue-baby",
  "Tainted ???": "tainted-blue-baby",
  "???'s Only Friend": "blue-babys-only-friend",
  "???'s Soul": "blue-babys-soul",
  "<3": "less-than-three",
};

export function slugify(name: string): string {
  const override = SLUG_OVERRIDES[name.trim()];
  if (override) return override;
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loose key for matching item names across pages (pool lists vs page titles). */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
