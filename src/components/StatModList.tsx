import type { StatModifiers } from "../lib/types";

const LABELS: Record<keyof StatModifiers, string> = {
  damage: "Damage",
  damageFlat: "Damage (flat)",
  damageMult: "Damage ×",
  tears: "Tears",
  tearsMult: "Fire rate ×",
  tearDelayFlat: "Tear delay",
  speed: "Speed",
  range: "Range",
  shotSpeed: "Shot speed",
  luck: "Luck",
  hearts: "Heart containers",
  soulHearts: "Soul hearts",
  blackHearts: "Black hearts",
};

function entryColor(key: string, value: number): string {
  const isMult = key.endsWith("Mult");
  const good = isMult ? value > 1 : key === "tearDelayFlat" ? value < 0 : value > 0;
  return good ? "text-heal" : "text-hurt";
}

function format(key: string, value: number): string {
  if (key.endsWith("Mult")) return `×${value}`;
  return value > 0 ? `+${value}` : `${value}`;
}

export default function StatModList({ mods }: { mods: StatModifiers }) {
  const entries = Object.entries(mods).filter(([, v]) => typeof v === "number") as [
    keyof StatModifiers,
    number,
  ][];
  if (entries.length === 0) {
    return <p className="text-muted">No flat stat changes — see description.</p>;
  }
  return (
    <table className="w-full">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-basement-border/50">
            <td className="py-1 pr-4 text-muted">{LABELS[key] ?? key}</td>
            <td className={`py-1 text-right font-bold ${entryColor(key, value)}`}>
              {format(key, value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
