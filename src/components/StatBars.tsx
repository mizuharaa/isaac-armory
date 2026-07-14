import { useEffect, useRef, useState } from "react";
import type { ComputedStats } from "../engine/stats";

interface Row {
  key: keyof ComputedStats;
  label: string;
  max: number;
  min?: number;
  format?: (v: number) => string;
}

const ROWS: Row[] = [
  { key: "speed", label: "SPEED", max: 2 },
  { key: "tearsPerSecond", label: "TEARS", max: 5 },
  { key: "damage", label: "DAMAGE", max: 12 },
  { key: "range", label: "RANGE", max: 12 },
  { key: "shotSpeed", label: "SHOT SPEED", max: 2 },
  { key: "luck", label: "LUCK", max: 10, min: -5 },
];

function Bar({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Quantize to 20 blocks so the fill snaps like pixel art.
  const blocks = Math.round(ratio * 20);
  return (
    <div className="flex h-3 w-40 gap-px border border-basement-border bg-black/60 p-px">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={`h-full flex-1 ${i < blocks ? "bg-blood" : "bg-transparent"}`} />
      ))}
    </div>
  );
}

/** One stat row with the up/down arrow flash when the value changes. */
function StatRow({ row, value }: { row: Row; value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value > prev.current + 1e-9) setFlash("up");
    else if (value < prev.current - 1e-9) setFlash("down");
    prev.current = value;
    if (flash !== null) {
      const t = setTimeout(() => setFlash(null), 1800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 font-pixel text-[9px] text-muted">{row.label}</span>
      <Bar value={value} max={row.max} min={row.min} />
      <span className="w-12 text-right tabular-nums">{value.toFixed(2)}</span>
      <span
        className={`w-4 font-bold ${
          flash === "up" ? "stat-flash text-heal" : flash === "down" ? "stat-flash text-hurt" : "opacity-0"
        }`}
      >
        {flash === "down" ? "▼" : "▲"}
      </span>
    </div>
  );
}

export default function StatBars({ stats }: { stats: ComputedStats }) {
  return (
    <div className="space-y-1.5">
      {ROWS.map((row) => (
        <StatRow key={row.key} row={row} value={stats[row.key] as number} />
      ))}
    </div>
  );
}
