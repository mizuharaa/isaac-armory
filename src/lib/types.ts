/** App-side mirrors of the schemas in scripts/lib/schema.ts. */

export type Dlc =
  | "rebirth"
  | "afterbirth"
  | "afterbirth_plus"
  | "repentance"
  | "repentance_plus";

export interface StatModifiers {
  damage?: number;
  damageFlat?: number;
  damageMult?: number;
  tears?: number;
  tearsMult?: number;
  tearDelayFlat?: number;
  speed?: number;
  range?: number;
  shotSpeed?: number;
  luck?: number;
  hearts?: number;
  soulHearts?: number;
  blackHearts?: number;
}

export interface Item {
  id: number | null;
  slug: string;
  name: string;
  wikiTitle: string;
  type: "passive" | "active" | "trinket";
  quality: 0 | 1 | 2 | 3 | 4 | null;
  pools: string[];
  quote: string;
  description: string;
  recharge?: number | "one_time" | "timed" | "unlimited";
  devilPrice?: number;
  shopPrice?: number;
  statModifiers: StatModifiers;
  statModifiersSource: "auto" | "override" | "none";
  behaviorTags: string[];
  spawnSources?: string[];
  imageUrl: string | null;
  dlc: Dlc;
  unlockCondition?: string;
}

export interface CharacterStats {
  damageBase: number;
  damageMult: number;
  tearsDelta: number;
  tearsMult: number;
  tearDelay: number;
  shotSpeed: number;
  range: number;
  speed: number;
  luck: number;
  random?: boolean;
}

export interface Health {
  red: number;
  soul: number;
  black: number;
  bone?: number;
  coin?: number;
  type: "normal" | "coin" | "none" | "bone" | "soul";
  random?: boolean;
}

export interface Character {
  slug: string;
  name: string;
  tainted: boolean;
  baseStats: CharacterStats;
  health: Health;
  startingItems: string[];
  startingTrinkets?: string[];
  innate?: string[];
  startingPickups?: string;
  altForm?: {
    name: string;
    stats?: Partial<CharacterStats>;
    health?: Partial<Health>;
    notes?: string;
  };
  imageUrl: string | null;
  wikiTitle: string;
  dlc: Dlc;
  unlockCondition?: string;
  notes?: string;
}

export interface Pool {
  slug: string;
  name: string;
  wikiTitle: string;
  greedMode: boolean;
  items: { slug: string; dlc?: string }[];
}

export const DLC_LABEL: Record<Dlc, string> = {
  rebirth: "Rebirth",
  afterbirth: "Afterbirth",
  afterbirth_plus: "Afterbirth+",
  repentance: "Repentance",
  repentance_plus: "Repentance+",
};
