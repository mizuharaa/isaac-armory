export default function QualityStars({ quality }: { quality: 0 | 1 | 2 | 3 | 4 | null }) {
  if (quality === null) return <span className="text-muted">—</span>;
  return (
    <span title={`Quality ${quality}`} className="tracking-widest">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className={i < quality ? "text-gold" : "text-basement-border"}>
          ★
        </span>
      ))}
    </span>
  );
}
