import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Hearts from "../components/Hearts";
import SpriteImg from "../components/SpriteImg";
import StatBars from "../components/StatBars";
import { computeStats } from "../engine/stats";
import { characterPortraitCandidates, itemSpriteCandidates } from "../lib/assets";
import { characterBySlug, itemBySlug, regularCharacters } from "../lib/data";
import { DLC_LABEL } from "../lib/types";
import { useLoadout } from "../store/loadout";

/** Regular slug → tainted counterpart (Tab toggles between them). */
const TAINTED_OF: Record<string, string> = {
  isaac: "tainted-isaac",
  magdalene: "tainted-magdalene",
  cain: "tainted-cain",
  judas: "tainted-judas",
  "blue-baby": "tainted-blue-baby",
  eve: "tainted-eve",
  samson: "tainted-samson",
  azazel: "tainted-azazel",
  lazarus: "tainted-lazarus",
  eden: "tainted-eden",
  "the-lost": "tainted-lost",
  lilith: "tainted-lilith",
  keeper: "tainted-keeper",
  apollyon: "tainted-apollyon",
  "the-forgotten": "tainted-forgotten",
  bethany: "tainted-bethany",
  "jacob-and-esau": "tainted-jacob",
};

export default function AvatarScreen() {
  const navigate = useNavigate();
  const selectCharacter = useLoadout((s) => s.selectCharacter);

  const [index, setIndex] = useState(0);
  const [tainted, setTainted] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const regular = regularCharacters[index];
  const character = useMemo(() => {
    if (!tainted) return regular;
    return characterBySlug.get(TAINTED_OF[regular.slug]) ?? regular;
  }, [regular, tainted]);

  const stats = useMemo(() => computeStats(character.baseStats, []), [character]);

  const cycle = (dir: 1 | -1) => {
    setIndex((i) => (i + dir + regularCharacters.length) % regularCharacters.length);
    setAnimKey((k) => k + 1);
  };
  const enterBasement = () => {
    selectCharacter(character.slug);
    navigate("/playground");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") cycle(1);
      else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") cycle(-1);
      else if (e.key === "Tab") {
        e.preventDefault();
        setTainted((t) => !t);
        setAnimKey((k) => k + 1);
      } else if (e.key === "Enter") enterBasement();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  const neighbor = (offset: number) =>
    regularCharacters[(index + offset + regularCharacters.length) % regularCharacters.length];

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 p-6">
      {/* Carousel */}
      <div className="flex w-full items-end justify-center gap-6">
        <button onClick={() => cycle(-1)} className="mb-16 font-pixel text-2xl text-muted hover:text-gold" aria-label="Previous character">
          ◀
        </button>

        {[-1, 0, 1].map((offset) => {
          const c = offset === 0 ? character : neighbor(offset);
          const center = offset === 0;
          return (
            <div key={offset} className={`flex flex-col items-center ${center ? "" : "hidden sm:flex"}`}>
              <div
                key={center ? animKey : undefined}
                className={center ? "step-in relative" : "opacity-30 grayscale"}
              >
                {/* spotlight */}
                {center && (
                  <div className="absolute -inset-x-8 -top-6 bottom-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(201,162,39,0.18),transparent_70%)]" />
                )}
                <SpriteImg
                  candidates={characterPortraitCandidates(c)}
                  alt={c.name}
                  className={`pixelated object-contain ${center ? "idle-bob h-56 w-56" : "h-24 w-24"}`}
                />
              </div>
              {/* pedestal */}
              <div
                className={`${center ? "h-5 w-44" : "h-2 w-20"} rounded-[50%] border-2 border-[#1a100a] bg-black/50 shadow-[0_5px_0_rgba(0,0,0,0.5)]`}
              />
              {center && (
                <h1 className="punch-lg mt-4 text-center font-pixel text-xl text-gold">{c.name}</h1>
              )}
            </div>
          );
        })}

        <button onClick={() => cycle(1)} className="mb-16 font-pixel text-2xl text-muted hover:text-gold" aria-label="Next character">
          ▶
        </button>
      </div>

      <p className="text-sm text-muted">
        ◀ ▶ / A D — cycle · TAB — tainted {tainted ? "(on)" : "(off)"} · ENTER — play
      </p>

      {/* Details */}
      <div className="panel grid w-full gap-6 p-6 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="border border-basement-border px-1.5 py-0.5 text-sm text-muted">
              {DLC_LABEL[character.dlc]}
            </span>
            {character.altForm && (
              <span className="text-sm text-muted">alt: {character.altForm.name}</span>
            )}
          </div>
          <StatBars stats={stats} />
          <div className="mt-4 flex items-center gap-3">
            <span className="font-pixel text-[9px] text-muted">HEALTH</span>
            <Hearts health={character.health} />
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="font-pixel text-[10px] text-muted">STARTING LOADOUT</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {character.startingItems.map((slug) => {
              const item = itemBySlug.get(slug);
              return item ? (
                <span
                  key={slug}
                  className="flex items-center gap-2 border-2 border-[#1a100a] bg-black/40 px-2 py-1"
                  title={item.description}
                >
                  <SpriteImg candidates={itemSpriteCandidates(item)} alt="" className="pixelated h-10 w-10 object-contain" />
                  <span className="punch text-lg">{item.name}</span>
                </span>
              ) : (
                <span key={slug} className="text-lg text-muted">
                  {slug}
                </span>
              );
            })}
            {(character.innate ?? []).map((t) => (
              <span key={t} className="border border-gold/40 px-2 py-1 text-sm text-gold">
                {t}
              </span>
            ))}
            {character.startingItems.length === 0 && !character.innate?.length && (
              <span className="text-sm text-muted">nothing — a true blank slate</span>
            )}
          </div>
          {character.startingPickups && (
            <p className="mt-2 text-sm text-muted">Pickups: {character.startingPickups}</p>
          )}
          {character.notes && <p className="mt-2 text-sm text-muted">{character.notes}</p>}
          {character.unlockCondition && (
            <p className="mt-2 text-sm text-muted">Unlock: {character.unlockCondition}</p>
          )}
        </div>
      </div>

      <button
        onClick={enterBasement}
        className="punch-lg border-4 border-blood bg-black/50 px-8 py-4 font-pixel text-base text-blood hover:bg-blood hover:text-white"
      >
        ENTER THE BASEMENT →
      </button>
    </div>
  );
}
