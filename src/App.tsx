import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useLoadout } from "./store/loadout";
import Armory from "./pages/Armory";
import AvatarScreen from "./pages/AvatarScreen";
import Playground from "./pages/Playground";
import { characterBySlug } from "./lib/data";

export default function App() {
  const characterSlug = useLoadout((s) => s.characterSlug);
  const equippedCount = useLoadout((s) => s.equipped.length);
  const character = characterBySlug.get(characterSlug);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 border-2 ${
      isActive
        ? "border-gold text-gold bg-basement-raised"
        : "border-basement-border text-muted hover:text-ink hover:border-muted"
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b-2 border-basement-border bg-basement-panel px-4 py-3">
        <Link to="/" className="font-pixel text-sm text-blood drop-shadow-[2px_2px_0_#000]">
          ISAAC ARMORY
        </Link>
        <nav className="flex gap-2 text-lg">
          <NavLink to="/" end className={navClass}>
            Characters
          </NavLink>
          <NavLink to="/armory" className={navClass}>
            Armory
          </NavLink>
          <NavLink to="/playground" className={navClass}>
            Playground
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-muted">
          {character && (
            <span className="flex items-center gap-2">
              {character.imageUrl && (
                <img
                  src={character.imageUrl}
                  alt={character.name}
                  className="pixelated h-8 w-8 object-contain"
                />
              )}
              {character.name}
            </span>
          )}
          <span className="border-2 border-basement-border px-2 py-1">
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

      <footer className="border-t-2 border-basement-border bg-basement-panel px-4 py-3 text-center text-sm text-muted">
        Unofficial fan project. The Binding of Isaac © Edmund McMillen / Nicalis. Data &amp;
        sprites hot-loaded from the{" "}
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
    </div>
  );
}
