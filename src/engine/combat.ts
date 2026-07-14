/**
 * Pure combat derivation: equipped items + character innates → weapon
 * configuration. Kept free of engine/DOM so item combos are unit-testable.
 *
 * Weapon override priority mirrors the game's (knife > brimstone > guided
 * missile > bomb shots > sword > tech laser > ipecac lob > tears); modifier
 * flags (homing/piercing/spectral/multishot/charge) apply to whichever
 * weapon wins, like the game's TearFlags
 * (https://wofsauge.github.io/IsaacDocs/abp/enums/TearFlags.html).
 */

export type FireMode =
  | "tears"
  | "brimstone"
  | "laser"
  | "knife"
  | "lob"
  | "bombshot"
  | "missile"
  | "sword"
  | "csection"
  | "ludovico";

export interface CombatConfig {
  fireMode: FireMode;
  shots: number;
  homing: boolean;
  piercing: boolean;
  spectral: boolean;
  /** hold-fire-to-charge weapons (Brimstone handled separately in-engine) */
  chargeShot: "none" | "chocolate" | "techx" | "lung";
  /** tear bursts into shrapnel on impact (Haemolacria) */
  burst: boolean;
  /** tears wrap around the screen (Continuum) */
  continuum: boolean;
  /** tears bounce off walls (Rubber Cement) */
  bounce: boolean;
  /** damage falls off with distance (Proptosis) */
  falloff: boolean;
  /** tears carry a damaging halo (Godhead) */
  aura: boolean;
  /** blocks one hit, recharges (Holy Mantle) */
  shield: boolean;
  /** shooter familiars that copy the player's shots */
  familiars: { slug: string; damageMult: number }[];
  tint: string | null;
  flight: boolean;
  sizeUp: boolean;
}

/** Costume-style looks for iconic items (sprite tint, applied in-engine). */
const TINTS: [string, string][] = [
  ["brimstone", "#c96a5e"],
  ["whore-of-babylon", "#8a8a9c"],
  ["gnawed-leaf", "#9aa39a"],
  ["the-virus", "#9cc98f"],
  ["lunch", "#e8d8a8"],
];

export function deriveCombat(
  equipped: string[],
  behaviorTags: Set<string>,
  innate: string[],
  maxDamageMult: number,
): CombatConfig {
  const slugs = new Set(equipped);
  const has = (...names: string[]) => names.some((n) => slugs.has(n));

  let fireMode: FireMode = "tears";
  if (has("moms-knife")) fireMode = "knife";
  else if (has("brimstone", "sulfur", "revelation") || innate.some((s) => /brimstone/i.test(s)))
    fireMode = "brimstone";
  else if (has("epic-fetus")) fireMode = "missile";
  else if (has("dr-fetus")) fireMode = "bombshot";
  else if (has("ludovico-technique")) fireMode = "ludovico";
  else if (has("spirit-sword")) fireMode = "sword";
  else if (has("c-section")) fireMode = "csection";
  else if (has("technology", "technology-2", "tech-x") && !has("tech-x")) fireMode = "laser";
  else if (has("ipecac", "bobs-brain")) fireMode = "lob";

  let shots = 1;
  if (has("20-20")) shots = Math.max(shots, 2);
  if (has("the-inner-eye") || innate.some((s) => /triple shot/i.test(s))) shots = Math.max(shots, 3);
  if (has("mutant-spider")) shots = Math.max(shots, 4);

  const familiars: CombatConfig["familiars"] = [];
  if (has("incubus")) familiars.push({ slug: "incubus", damageMult: 0.75 });
  if (has("twisted-pair")) {
    familiars.push({ slug: "twisted-pair", damageMult: 0.5 }, { slug: "twisted-pair", damageMult: 0.5 });
  }

  return {
    fireMode,
    shots,
    homing: behaviorTags.has("homing") || has("sacred-heart", "godhead", "spoon-bender"),
    piercing: behaviorTags.has("piercing") || has("cupids-arrow", "death-certificate") || fireMode === "csection",
    spectral: behaviorTags.has("spectral") || has("ouija-board"),
    chargeShot: has("tech-x")
      ? "techx"
      : has("monstros-lung")
        ? "lung"
        : has("chocolate-milk")
          ? "chocolate"
          : "none",
    burst: has("haemolacria"),
    continuum: has("continuum"),
    bounce: has("rubber-cement"),
    falloff: has("proptosis"),
    aura: has("godhead"),
    shield: has("holy-mantle"),
    familiars,
    tint: TINTS.find(([slug]) => slugs.has(slug))?.[1] ?? null,
    // explicit item list — description keyword matching gave false positives
    // that made every character hover
    flight:
      innate.some((s) => /flight/i.test(s)) ||
      has("revelation", "fate", "transcendence", "dead-dove", "holy-grail",
          "spirit-of-the-night", "astral-projection", "dogma", "empty-vessel", "lord-of-the-pit"),
    sizeUp: maxDamageMult >= 1.5,
  };
}
