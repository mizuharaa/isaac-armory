/**
 * Minimal wikitext utilities: a nested-template tokenizer and a plain-text
 * stripper. Regex alone cannot parse infoboxes because field values contain
 * nested templates ({{hearts|red=3}}) and piped links ([[Rooms|room]]).
 */

export interface Template {
  name: string;
  positional: string[];
  named: Record<string, string>;
  raw: string;
}

/** Index just past the matching `}}` for a `{{` at `start`, or -1. */
function findTemplateEnd(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length - 1) {
    if (s[i] === "{" && s[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    if (s[i] === "}" && s[i + 1] === "}") {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return -1;
}

/** Split on `sep` only at zero {{ }} / [[ ]] nesting depth. */
export function splitTopLevel(s: string, sep = "|"): string[] {
  const parts: string[] = [];
  let templateDepth = 0;
  let linkDepth = 0;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (pair === "{{") { templateDepth++; current += pair; i++; continue; }
    if (pair === "}}") { templateDepth--; current += pair; i++; continue; }
    if (pair === "[[") { linkDepth++; current += pair; i++; continue; }
    if (pair === "]]") { linkDepth--; current += pair; i++; continue; }
    if (s[i] === sep && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += s[i];
  }
  parts.push(current);
  return parts;
}

function indexOfTopLevelEquals(s: string): number {
  let templateDepth = 0;
  let linkDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (pair === "{{") { templateDepth++; i++; continue; }
    if (pair === "}}") { templateDepth--; i++; continue; }
    if (pair === "[[") { linkDepth++; i++; continue; }
    if (pair === "]]") { linkDepth--; i++; continue; }
    if (s[i] === "=" && templateDepth === 0 && linkDepth === 0) return i;
  }
  return -1;
}

export function parseTemplate(raw: string): Template | null {
  if (!raw.startsWith("{{") || !raw.endsWith("}}")) return null;
  const parts = splitTopLevel(raw.slice(2, -2));
  const name = parts[0].trim().replace(/_/g, " ");
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = indexOfTopLevelEquals(part);
    if (eq !== -1) {
      named[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    } else {
      positional.push(part.trim());
    }
  }
  return { name, positional, named, raw };
}

/** All OUTERMOST templates in the text (nested ones stay inside their parent's raw/values). */
export function findTemplates(wikitext: string): Template[] {
  const out: Template[] = [];
  let i = 0;
  while (i < wikitext.length - 1) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      const end = findTemplateEnd(wikitext, i);
      if (end === -1) break;
      const t = parseTemplate(wikitext.slice(i, end));
      if (t) out.push(t);
      i = end;
    } else {
      i++;
    }
  }
  return out;
}

// Inline templates whose first positional argument IS the display text
// ({{i|Brimstone}} renders as a Brimstone link, etc.).
const NAME_ARG_TEMPLATES = new Set([
  "i", "t", "c", "e", "r", "s", "p", "a", "m", "b",
  "item", "collectible", "trinket", "chest", "card", "rune", "pill",
  "soul", "bosslink", "achievement",
]);
// Inline templates that render as icons/markers and carry no prose.
const DROP_TEMPLATES = new Set([
  "dlc", "dlc+", "unlockable", "blindfolded", "ghost", "clear", "cit",
  "nav", "mode", "context push", "context pop", "hearts", "heart",
  "distinguish", "disambig msg", "#ev:youtube", "transformation",
]);

/** Render wikitext down to plain prose (links → text, inline templates resolved). */
export function stripWikitext(input: string): string {
  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<math[\s\S]*?<\/math>/gi, "");
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, "").replace(/<ref[^>]*\/>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, " ");

  // Resolve templates innermost-first so nesting unwinds naturally.
  for (let guard = 0; guard < 25 && /\{\{[^{}]*\}\}/.test(s); guard++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_all, inner: string) => {
      const parts = inner.split("|");
      const name = parts[0].trim().toLowerCase().replace(/_/g, " ");
      if (DROP_TEMPLATES.has(name) || name.startsWith("#")) return "";
      const firstArg = parts.slice(1).find((p) => !p.includes("="));
      if (NAME_ARG_TEMPLATES.has(name)) return firstArg?.trim() ?? "";
      return firstArg?.trim() ?? "";
    });
  }

  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, "$1");
  s = s.replace(/'''''|'''|''/g, "");
  s = s.replace(/<[^>]+>/g, "");
  return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
}
