import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API = "https://bindingofisaacrebirth.fandom.com/api.php";
const USER_AGENT =
  "isaac-armory-scraper/1.0 (personal non-commercial fan project; respects 2 req/s)";
const CACHE_DIR = path.resolve("data/.cache");
const MIN_INTERVAL_MS = 500; // max ~2 requests/second

let lastRequestAt = 0;
let cacheDirReady = false;
let liveRequests = 0;

export function getLiveRequestCount(): number {
  return liveRequests;
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * GET against the MediaWiki API with disk caching. The cache key is the full
 * sorted query string, so identical calls never re-hit the network — this is
 * what makes the scraper resumable.
 */
export async function apiGet(params: Record<string, string>): Promise<any> {
  const search = new URLSearchParams({ format: "json", ...params });
  search.sort();
  const url = `${API}?${search.toString()}`;

  if (!cacheDirReady) {
    await mkdir(CACHE_DIR, { recursive: true });
    cacheDirReady = true;
  }
  const cacheFile = path.join(
    CACHE_DIR,
    createHash("sha1").update(url).digest("hex") + ".json",
  );
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    /* cache miss */
  }

  for (let attempt = 1; ; attempt++) {
    await throttle();
    liveRequests++;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    } catch (err) {
      if (attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      await writeFile(cacheFile, JSON.stringify(body));
      return body;
    }
    if (attempt >= 5) throw new Error(`API HTTP ${res.status} after ${attempt} attempts: ${url}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

/** All page titles in a category (namespace 0 only), following cmcontinue. */
export async function categoryMembers(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  do {
    const params: Record<string, string> = {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      cmnamespace: "0",
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const res = await apiGet(params);
    for (const m of res.query?.categorymembers ?? []) titles.push(m.title);
    cmcontinue = res.continue?.cmcontinue;
  } while (cmcontinue);
  return titles;
}

/** Wikitext of a page, following redirects. Returns null for missing pages. */
export async function pageWikitext(
  title: string,
): Promise<{ title: string; wikitext: string } | null> {
  const res = await apiGet({
    action: "parse",
    page: title,
    prop: "wikitext",
    redirects: "1",
  });
  if (res.error || !res.parse?.wikitext) return null;
  return { title: res.parse.title, wikitext: res.parse.wikitext["*"] };
}

/**
 * Resolve `File:` titles to their hosted URLs in batches of 50.
 * Returns a map keyed by BOTH the requested title and the normalized title.
 */
export async function fileUrls(fileTitles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < fileTitles.length; i += 50) {
    const batch = fileTitles.slice(i, i + 50);
    const res = await apiGet({
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "url",
    });
    const denormalize = new Map<string, string>();
    for (const n of res.query?.normalized ?? []) denormalize.set(n.to, n.from);
    for (const page of Object.values<any>(res.query?.pages ?? {})) {
      const url = page.imageinfo?.[0]?.url;
      if (!url) continue;
      out.set(page.title, url);
      const requested = denormalize.get(page.title);
      if (requested) out.set(requested, url);
    }
  }
  return out;
}

/** All image file titles used on a page (fallback when the guessed name misses). */
export async function pageImages(title: string): Promise<string[]> {
  const res = await apiGet({
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "500",
  });
  const pages = res.query?.pages ?? {};
  const first: any = Object.values(pages)[0];
  return (first?.images ?? []).map((i: any) => i.title as string);
}
