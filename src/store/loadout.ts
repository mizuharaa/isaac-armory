import { create } from "zustand";
import { persist } from "zustand/middleware";
import { characterBySlug, itemBySlug } from "../lib/data";

/**
 * Global loadout: selected character + equipped item slugs (duplicates
 * allowed — stat items stack in the real game).
 *
 * Rules (anti-dupe / game-accurate):
 * - max 3 copies of the same item, 40 items total
 * - ONE active item — TWO while Schoolbag is equipped
 * - ONE trinket (equipping another swaps it)
 * - selecting a character resets the loadout to their starting items
 */
const MAX_COPIES = 3;
const MAX_ITEMS = 40;
const ACTIVE_SLOT_ITEM = "schoolbag";

interface LoadoutState {
  characterSlug: string;
  equipped: string[];
  selectCharacter: (slug: string) => void;
  equip: (slug: string) => void;
  unequip: (slug: string) => void;
  toggle: (slug: string) => void;
  clearLoadout: () => void;
}

export const useLoadout = create<LoadoutState>()(
  persist(
    (set, get) => ({
      characterSlug: "isaac",
      equipped: [],
      selectCharacter: (slug) => {
        const character = characterBySlug.get(slug);
        set({
          characterSlug: slug,
          // the game auto-equips starting items (Azazel's Brimstone, etc.)
          equipped: character?.startingItems.filter((s) => itemBySlug.has(s)) ?? [],
        });
      },
      equip: (slug) => {
        const item = itemBySlug.get(slug);
        if (!item) return;
        set((state) => {
          let equipped = [...state.equipped];
          if (equipped.length >= MAX_ITEMS) return {};
          if (equipped.filter((s) => s === slug).length >= MAX_COPIES) return {};
          if (item.type === "active") {
            const slots = equipped.includes(ACTIVE_SLOT_ITEM) && slug !== ACTIVE_SLOT_ITEM ? 2 : 1;
            const actives = equipped.filter((s) => itemBySlug.get(s)?.type === "active");
            if (actives.filter((s) => s === slug).length > 0) return {}; // no duplicate actives
            if (actives.length >= slots) {
              // swap out the oldest active
              const oldest = actives[0];
              equipped = equipped.filter((s, i) => !(s === oldest && i === equipped.indexOf(oldest)));
            }
          }
          if (item.type === "trinket") {
            equipped = equipped.filter((s) => itemBySlug.get(s)?.type !== "trinket");
          }
          return { equipped: [...equipped, slug] };
        });
      },
      unequip: (slug) =>
        set((state) => {
          const idx = state.equipped.lastIndexOf(slug);
          if (idx === -1) return {};
          const equipped = [...state.equipped];
          equipped.splice(idx, 1);
          return { equipped };
        }),
      toggle: (slug) => {
        if (get().equipped.includes(slug)) get().unequip(slug);
        else get().equip(slug);
      },
      clearLoadout: () => set({ equipped: [] }),
    }),
    { name: "isaac-armory-loadout" },
  ),
);
