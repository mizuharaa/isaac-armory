import { findTemplates, type Template } from "./wikitext";

export type InfoboxKind = "passive" | "active" | "trinket" | "character";

const KIND_BY_NAME: Record<string, InfoboxKind> = {
  "infobox passive collectible": "passive",
  "infobox activated collectible": "active",
  "infobox active collectible": "active",
  "infobox trinket": "trinket",
  "infobox character": "character",
};

// Fields the scraper consumes (or knowingly ignores). Anything else is
// counted in the report so the parser can be extended.
export const KNOWN_ITEM_FIELDS = new Set([
  "name", "id", "quote", "description", "quality", "tags", "recharge",
  "unlocked by", "devil price", "pool", "dlc",
  // presentation-only fields we deliberately ignore:
  "image name", "costume name", "tear app scale", "image", "alt image name",
  "alternate image name", "collection grid",
]);

export const KNOWN_CHARACTER_FIELDS = new Set([
  "name", "id", "dlc", "health", "pickups", "collectibles", "trinkets",
  "trinket", "pocket", "unlocked by", "image name", "image",
]);

export interface Infobox {
  kind: InfoboxKind;
  fields: Record<string, string>;
  template: Template;
}

export function findInfobox(wikitext: string): Infobox | null {
  for (const t of findTemplates(wikitext)) {
    const key = t.name.toLowerCase().replace(/[_\s]+/g, " ").trim();
    const kind = KIND_BY_NAME[key];
    if (kind) return { kind, fields: t.named, template: t };
  }
  return null;
}
