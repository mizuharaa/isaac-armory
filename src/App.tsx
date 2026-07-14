import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import SpriteImg from "./components/SpriteImg";
import { characterPortraitCandidates } from "./lib/assets";
import { characterBySlug } from "./lib/data";
import Armory from "./pages/Armory";
import AvatarScreen from "./pages/AvatarScreen";
import Playground from "./pages/Playground";
import { useLoadout } from "./store/loadout";

export default function App() {
  const characterSlug = useLoadout((s) => s.characterSlug);
  const equippedCount = useLoadout((s) => s.equipped.length);
  const character = characterBySlug.get(characterSlug);
  const isPlayground = useLocation().pathname.startsWith("/playground");

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `punch px-4 py-2 border-2 font-pixel text-[11px] ${
      isActive
        ? "border-gold text-gold bg-black/40"
        : "border-[#1a100a] text-[#c9bda1] hover:text-ink hover:border-muted bg-black/25"
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 flex-wrap items-center gap-4 border-b-4 border-[#1a100a] bg-black/45 px-4 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
        <Link to="/" className="punch-lg font-pixel text-lg text-blood">
          ISAAC ARMORY
        </Link>
        <nav className="flex gap-2">
          <NavLink to="/" end className={navClass}>
            CHARACTERS
          </NavLink>
          <NavLink to="/armory" className={navClass}>
            ARMORY
          </NavLink>
          <NavLink to="/playground" className={navClass}>
            PLAYGROUND
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-[#c9bda1]">
          {character && (
            <span className="punch flex items-center gap-2 text-xl">
              <SpriteImg
                candidates={characterPortraitCandidates(character)}
                alt={character.name}
                className="pixelated h-10 w-10 object-contain"
              />
              {character.name}
            </span>
          )}
          <span className="punch border-2 border-[#1a100a] bg-black/30 px-2 py-1 text-lg">
            {equippedCount} item{equippedCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<AvatarScreen />} />
          <Route path="/armory" element={<Armory />} />
          <Route path="/armory/:slug" element={<Armory />} />
          <Route path="/playground" element={<Playground />} />
        </Routes>
      </main>

      {!isPlayground && (
        <footer className="punch border-t-4 border-[#1a100a] bg-black/45 px-4 py-3 text-center text-lg text-[#c9bda1]">
          Unofficial fan project. The Binding of Isaac © Edmund McMillen / Nicalis. Data &amp; sprites
          from the{" "}
          <a
            className="text-gold underline"
            href="https://bindingofisaacrebirth.fandom.com"
            target="_blank"
            rel="noreferrer"
          >
            community wiki
          </a>{" "}
          (CC-BY-SA). No game assets are redistributed by this project.
        </footer>
      )}
    </div>
  );
}
