import { create } from "zustand";
import { persist } from "zustand/middleware";
import { itemBySlug } from "../lib/data";

/**
 * Global loadout: selected character + equipped item slugs.
 * Game rules approximated for the sandbox: unlimited unique passives,
 * ONE active item, ONE trinket (equipping another swaps it out).
 */
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
      selectCharacter: (slug) => set({ characterSlug: slug }),
      equip: (slug) => {
        const item = itemBySlug.get(slug);
        if (!item) return;
        set((state) => {
          let equipped = state.equipped.filter((s) => s !== slug);
          if (item.type === "active" || item.type === "trinket") {
            equipped = equipped.filter((s) => itemBySlug.get(s)?.type !== item.type);
          }
          return { equipped: [...equipped, slug] };
        });
      },
      unequip: (slug) =>
        set((state) => ({ equipped: state.equipped.filter((s) => s !== slug) })),
      toggle: (slug) => {
        if (get().equipped.includes(slug)) get().unequip(slug);
        else get().equip(slug);
      },
      clearLoadout: () => set({ equipped: [] }),
    }),
    { name: "isaac-armory-loadout" },
  ),
);
