import { pageWikitext } from "./api";
import { findTemplates, stripWikitext } from "./wikitext";

export interface PoolDraft {
  wikiTitle: string;
  name: string;
  greedMode: boolean;
  entries: { name: string; dlc?: string }[];
}

// Safety net in case Template:ItemPoolHeader changes shape. Pool pages follow
// the "<Name> (Item Pool)" / "<Name> (Greed Mode Item Pool)" convention.
const FALLBACK_POOL_PAGES = [
  "Treasure Room (Item Pool)",
  "Shop (Item Pool)",
  "Boss (Item Pool)",
  "Devil Room (Item Pool)",
  "Angel Room (Item Pool)",
  "Secret Room (Item Pool)",
  "Library (Item Pool)",
  "Golden Chest (Item Pool)",
  "Red Chest (Item Pool)",
  "Curse Room (Item Pool)",
  "Key Master (Item Pool)",
  "Beggar (Item Pool)",
  "Demon Beggar (Item Pool)",
  "Bomb Bum (Item Pool)",
  "Battery Bum (Item Pool)",
  "Mom's Chest (Item Pool)",
  "Planetarium (Item Pool)",
  "Crane Game (Item Pool)",
  "Ultra Secret Room (Item Pool)",
  "Baby Shop (Item Pool)",
  "Wooden Chest (Item Pool)",
  "Rotten Beggar (Item Pool)",
  "Treasure Room (Greed Mode Item Pool)",
  "Shop (Greed Mode Item Pool)",
  "Boss (Greed Mode Item Pool)",
  "Devil Room (Greed Mode Item Pool)",
  "Angel Room (Greed Mode Item Pool)",
  "Curse Room (Greed Mode Item Pool)",
  "Secret Room (Greed Mode Item Pool)",
];

export async function fetchPoolDrafts(
  log: (msg: string) => void,
  reportMissing: (title: string) => void,
): Promise<PoolDraft[]> {
  const titles = new Set<string>(FALLBACK_POOL_PAGES);
  const header = await pageWikitext("Template:ItemPoolHeader");
  if (header) {
    const linkRe = /\[\[([^\]|#]+\((?:Greed Mode )?Item Pool\))\s*(?:\|[^\]]*)?\]\]/g;
    for (const m of header.wikitext.matchAll(linkRe)) titles.add(m[1].trim());
  }

  const drafts: PoolDraft[] = [];
  const seenResolved = new Set<string>();
  for (const requested of [...titles].sort()) {
    const page = await pageWikitext(requested);
    if (!page) {
      reportMissing(requested);
      continue;
    }
    if (seenResolved.has(page.title)) continue; // redirect duplicate
    seenResolved.add(page.title);

    const entries: { name: string; dlc?: string }[] = [];
    for (const t of findTemplates(page.wikitext)) {
      if (t.name.trim().toLowerCase() !== "pool items") continue;
      const names = (t.positional[0] ?? "")
        .split(",")
        .map((n) => stripWikitext(n).trim())
        .filter(Boolean);
      const marker = t.positional[1]
        ? stripWikitext(t.positional[1]).trim() || undefined
        : undefined;
      for (const name of names) entries.push({ name, dlc: marker });
    }
    if (entries.length === 0) {
      reportMissing(`${page.title} (page exists but has no {{pool items}} lists)`);
      continue;
    }

    const greedMode = /\(Greed Mode Item Pool\)\s*$/.test(page.title);
    const name = page.title.replace(/\s*\((?:Greed Mode )?Item Pool\)\s*$/, "");
    drafts.push({ wikiTitle: page.title, name, greedMode, entries });
    log(`pool "${page.title}": ${entries.length} entries`);
  }
  return drafts;
}
