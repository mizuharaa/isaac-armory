/**
 * Tiny fuzzy matcher: exact substring beats subsequence; word starts and
 * consecutive runs score extra. Returns 0 for no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();

  const sub = t.indexOf(q);
  if (sub !== -1) return 1000 - sub - (t.length - q.length) * 0.01;

  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    score += 1;
    if (found === lastMatch + 1) score += 2; // consecutive run
    if (found === 0 || t[found - 1] === " " || t[found - 1] === "'") score += 3; // word start
    lastMatch = found;
    ti = found + 1;
  }
  return score;
}
