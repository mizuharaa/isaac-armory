import type { StatModifiers } from "./schema";

/**
 * Best-effort extraction of stat modifiers from an item's (plain-text)
 * effect description, e.g. "+0.7 tears." → { tears: 0.7 }.
 *
 * The wiki does not publish machine-readable stat data, so anything this
 * cannot capture numerically ("All stats up", "Damage up") is reported as
 * ambiguous and belongs in data/overrides/stat-modifiers.json instead.
 */
export function extractStatModifiers(description: string): {
  mods: StatModifiers;
  ambiguous: string[];
} {
  const d = description;
  const mods: StatModifiers = {};
  const ambiguous: string[] = [];
  const NUM = "([+-]\\d+(?:\\.\\d+)?)";

  const grab = (re: RegExp): number | undefined => {
    const m = d.match(re);
    return m ? parseFloat(m[1]) : undefined;
  };

  const damageMult =
    grab(/[x×*]\s?(\d+(?:\.\d+)?)\s*damage(?:\s*multiplier)?/i) ??
    grab(/damage\s*(?:multiplier)?\s*[x×*]\s?(\d+(?:\.\d+)?)/i);
  if (damageMult !== undefined) mods.damageMult = damageMult;

  const damage = grab(new RegExp(`${NUM}\\s*(?:flat\\s+)?damage\\b`, "i"));
  if (damage !== undefined) mods.damage = damage;

  const tearsMult = grab(/[x×*]\s?(\d+(?:\.\d+)?)\s*(?:tears|fire rate)/i);
  if (tearsMult !== undefined) mods.tearsMult = tearsMult;

  const tears = grab(new RegExp(`${NUM}\\s*(?:tears|fire rate)\\b`, "i"));
  if (tears !== undefined) mods.tears = tears;

  // "shot speed" must run before "speed"; the plain speed pattern cannot
  // match "shot speed" because the word "shot" sits between number and "speed".
  const shotSpeed = grab(new RegExp(`${NUM}\\s*shot speed\\b`, "i"));
  if (shotSpeed !== undefined) mods.shotSpeed = shotSpeed;

  const speed = grab(new RegExp(`${NUM}\\s*speed\\b`, "i"));
  if (speed !== undefined) mods.speed = speed;

  const range = grab(new RegExp(`${NUM}\\s*range\\b`, "i"));
  if (range !== undefined) mods.range = range;

  const luck = grab(new RegExp(`${NUM}\\s*luck\\b`, "i"));
  if (luck !== undefined) mods.luck = luck;

  const hearts = grab(/\+(\d+)\s*(?:red\s+)?heart containers?/i);
  if (hearts !== undefined) mods.hearts = hearts;

  const soulHearts = grab(/\+(\d+)\s*soul hearts?/i);
  if (soulHearts !== undefined) mods.soulHearts = soulHearts;

  const blackHearts = grab(/\+(\d+)\s*black hearts?/i);
  if (blackHearts !== undefined) mods.blackHearts = blackHearts;

  // Flag stat language that we could not pin to a number.
  const vagueChecks: Array<[RegExp, Array<keyof StatModifiers>]> = [
    [/\btears (up|down)\b/i, ["tears", "tearsMult"]],
    [/\bdamage (up|down)\b/i, ["damage", "damageMult"]],
    [/\bspeed (up|down)\b/i, ["speed"]],
    [/\brange (up|down)\b/i, ["range"]],
    [/\bshot speed (up|down)\b/i, ["shotSpeed"]],
    [/\bluck (up|down)\b/i, ["luck"]],
    [/\b(?:hp|health) (up|down)\b/i, ["hearts"]],
    [/\ball stats (up|down)\b/i, []],
  ];
  for (const [re, keys] of vagueChecks) {
    const captured = keys.some((k) => mods[k] !== undefined);
    if (re.test(d) && (!captured || keys.length === 0)) {
      ambiguous.push(re.source.replace(/\\b/g, "").replace(/\\/g, ""));
    }
  }

  return { mods, ambiguous };
}

/** Heuristic behavior tags from the description (firing-mode items etc.). */
export function extractBehaviorTags(description: string): string[] {
  const tags: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/tears are replaced|replaces (?:isaac's )?tears|instead of tears/i, "replaces_tears"],
    [/\blaser\b/i, "laser"],
    [/\bhoming\b/i, "homing"],
    [/\bpiercing\b/i, "piercing"],
    [/\bspectral\b/i, "spectral"],
    [/\bflight\b|\bflying\b/i, "flight"],
    [/\bfamiliar\b/i, "familiar"],
    [/\bknife\b/i, "knife"],
    [/\borbits?\b/i, "orbital"],
    [/\bexplod/i, "explosive"],
    [/\bpoison/i, "poison"],
    [/\bfear\b|\bcharm\b|\bconfus/i, "status_effects"],
  ];
  for (const [re, tag] of checks) if (re.test(description)) tags.push(tag);
  return tags;
}
