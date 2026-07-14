import { z } from "zod";

export const DlcSchema = z.enum([
  "rebirth",
  "afterbirth",
  "afterbirth_plus",
  "repentance",
  "repentance_plus",
]);
export type Dlc = z.infer<typeof DlcSchema>;

export const StatModifiersSchema = z
  .object({
    damage: z.number().optional(),
    /** Adds after the sqrt damage formula but before multipliers (Polyphemus). */
    damageFlat: z.number().optional(),
    damageMult: z.number().optional(),
    tears: z.number().optional(),
    tearsMult: z.number().optional(),
    tearDelayFlat: z.number().optional(),
    speed: z.number().optional(),
    range: z.number().optional(),
    shotSpeed: z.number().optional(),
    luck: z.number().optional(),
    hearts: z.number().optional(),
    soulHearts: z.number().optional(),
    blackHearts: z.number().optional(),
  })
  .strict();
export type StatModifiers = z.infer<typeof StatModifiersSchema>;

export const ItemSchema = z.object({
  id: z.number().int().nullable(),
  slug: z.string().min(1),
  name: z.string().min(1),
  wikiTitle: z.string().min(1),
  type: z.enum(["passive", "active", "trinket"]),
  quality: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.null(),
  ]),
  pools: z.array(z.string()),
  quote: z.string(),
  description: z.string(),
  recharge: z
    .union([z.number(), z.enum(["one_time", "timed", "unlimited"])])
    .optional(),
  devilPrice: z.number().optional(),
  shopPrice: z.number().optional(),
  statModifiers: StatModifiersSchema,
  statModifiersSource: z.enum(["auto", "override", "none"]),
  behaviorTags: z.array(z.string()),
  spawnSources: z.array(z.string()).optional(),
  imageUrl: z.string().nullable(),
  dlc: DlcSchema,
  unlockCondition: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const CharacterStatsSchema = z.object({
  damageBase: z.number(),
  damageMult: z.number(),
  /** Delta on the tears stat as the wiki documents it (fire-rate units). */
  tearsDelta: z.number(),
  tearsMult: z.number(),
  /** Derived pre-multiplier fire delay for display; the engine recomputes from tearsDelta. */
  tearDelay: z.number(),
  shotSpeed: z.number(),
  range: z.number(),
  speed: z.number(),
  luck: z.number(),
  random: z.boolean().optional(),
});
export type CharacterStats = z.infer<typeof CharacterStatsSchema>;

export const HealthSchema = z.object({
  red: z.number(),
  soul: z.number(),
  black: z.number(),
  bone: z.number().optional(),
  coin: z.number().optional(),
  type: z.enum(["normal", "coin", "none", "bone", "soul"]),
  random: z.boolean().optional(),
});
export type Health = z.infer<typeof HealthSchema>;

export const CharacterSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  tainted: z.boolean(),
  baseStats: CharacterStatsSchema,
  health: HealthSchema,
  /** Slugs of starting collectibles. */
  startingItems: z.array(z.string()),
  startingTrinkets: z.array(z.string()).optional(),
  /** Built-in abilities that are not items (Flight, Bone club, Triple shot…). */
  innate: z.array(z.string()).optional(),
  startingPickups: z.string().optional(),
  altForm: z
    .object({
      name: z.string(),
      stats: CharacterStatsSchema.partial().optional(),
      health: HealthSchema.partial().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  imageUrl: z.string().nullable(),
  wikiTitle: z.string().min(1),
  dlc: DlcSchema,
  unlockCondition: z.string().optional(),
  notes: z.string().optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const PoolSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  wikiTitle: z.string().min(1),
  greedMode: z.boolean(),
  items: z.array(
    z.object({
      slug: z.string(),
      /** Raw wiki availability marker from {{pool items|…|marker}}: a, a+, r, nr, a+nr… */
      dlc: z.string().optional(),
    }),
  ),
});
export type Pool = z.infer<typeof PoolSchema>;
