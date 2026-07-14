import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ItemCard from "../components/ItemCard";
import ItemDetailModal from "../components/ItemDetailModal";
import { allItems, itemBySlug, pools, statImpact } from "../lib/data";
import { fuzzyScore } from "../lib/fuzzy";
import { DLC_LABEL, type Dlc, type Item } from "../lib/types";
import { useLoadout } from "../store/loadout";

type SortKey = "name" | "id" | "quality" | "impact";
const TYPES = ["passive", "active", "trinket"] as const;
const QUALITIES = [0, 1, 2, 3, 4] as const;
const DLCS: Dlc[] = ["rebirth", "afterbirth", "afterbirth_plus", "repentance"];

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}

export default function Armory() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const equipped = useLoadout((s) => s.equipped);

  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [qualities, setQualities] = useState<Set<number>>(new Set());
  const [dlcs, setDlcs] = useState<Set<Dlc>>(new Set());
  const [pool, setPool] = useState<string | null>(null);
  const [showGreed, setShowGreed] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  const visiblePools = useMemo(
    () => pools.filter((p) => (showGreed ? true : !p.greedMode)),
    [showGreed],
  );

  const filtered = useMemo(() => {
    let list = allItems;
    if (types.size) list = list.filter((i) => types.has(i.type));
    if (qualities.size) list = list.filter((i) => i.quality !== null && qualities.has(i.quality));
    if (dlcs.size) list = list.filter((i) => dlcs.has(i.dlc));
    if (pool) list = list.filter((i) => i.pools.includes(pool));

    if (search.trim()) {
      list = list
        .map((i) => ({
          i,
          score: Math.max(
            fuzzyScore(search, i.name) * 3,
            fuzzyScore(search, i.description) || 0,
          ),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.i);
      return list;
    }

    const sorted = [...list];
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "id":
        sorted.sort((a, b) => (a.id ?? 1e9) - (b.id ?? 1e9));
        break;
      case "quality":
        sorted.sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1) || a.name.localeCompare(b.name));
        break;
      case "impact":
        sorted.sort((a, b) => statImpact(b) - statImpact(a));
        break;
    }
    return sorted;
  }, [search, types, qualities, dlcs, pool, sort]);

  const selectedItem: Item | undefined = slug ? itemBySlug.get(slug) : undefined;

  const railButton = (active: boolean) =>
    `block w-full border px-2 py-1 text-left text-sm ${
      active
        ? "border-gold text-gold bg-basement-raised"
        : "border-basement-border text-muted hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row">
      {/* Filter rail */}
      <aside className="w-full shrink-0 space-y-4 md:w-56">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full border-2 border-basement-border bg-basement px-2 py-1.5 text-ink placeholder:text-muted focus:border-gold focus:outline-none"
        />

        <div>
          <h3 className="mb-1 font-pixel text-[10px] text-muted">TYPE</h3>
          <div className="flex gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypes(toggleSet(types, t))}
                className={`flex-1 border px-1 py-1 text-sm capitalize ${
                  types.has(t)
                    ? "border-gold text-gold"
                    : "border-basement-border text-muted hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-pixel text-[10px] text-muted">QUALITY</h3>
          <div className="flex gap-1">
            {QUALITIES.map((q) => (
              <button
                key={q}
                onClick={() => setQualities(toggleSet(qualities, q))}
                className={`flex-1 border px-1 py-1 text-sm ${
                  qualities.has(q)
                    ? "border-gold text-gold"
                    : "border-basement-border text-muted hover:text-ink"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-pixel text-[10px] text-muted">DLC</h3>
          <div className="space-y-1">
            {DLCS.map((d) => (
              <button key={d} onClick={() => setDlcs(toggleSet(dlcs, d))} className={railButton(dlcs.has(d))}>
                {DLC_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-pixel text-[10px] text-muted">ITEM POOL</h3>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={showGreed}
                onChange={(e) => {
                  setShowGreed(e.target.checked);
                  if (!e.target.checked && pool?.endsWith("-greed")) setPool(null);
                }}
              />
              greed
            </label>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            <button onClick={() => setPool(null)} className={railButton(pool === null)}>
              All pools
            </button>
            {visiblePools.map((p) => (
              <button key={p.slug} onClick={() => setPool(p.slug)} className={railButton(pool === p.slug)}>
                {p.name}
                {p.greedMode ? " (Greed)" : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-pixel text-[10px] text-muted">SORT</h3>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full border-2 border-basement-border bg-basement px-2 py-1.5 text-ink focus:border-gold focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="id">Item ID</option>
            <option value="quality">Quality</option>
            <option value="impact">Most stat impact</option>
          </select>
        </div>
      </aside>

      {/* Grid */}
      <section className="min-w-0 flex-1">
        <p className="mb-2 text-sm text-muted">
          {filtered.length} of {allItems.length} entries
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {filtered.map((item) => (
            <ItemCard
              key={item.slug}
              item={item}
              equipped={equipped.includes(item.slug)}
              onClick={() => navigate(`/armory/${item.slug}`)}
            />
          ))}
        </div>
      </section>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => navigate("/armory")} />
      )}
    </div>
  );
}
