import { useEffect, useState } from "react";

/**
 * <img> that walks a candidate-URL list on error: local extracted asset
 * first, wiki-hosted sprite as fallback. Resets when candidates change.
 */
export default function SpriteImg({
  candidates,
  alt,
  className,
  width,
  height,
  title,
}: {
  candidates: string[];
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidates.join("|")]);

  if (index >= candidates.length) {
    return (
      <span
        className={`inline-flex items-center justify-center text-muted ${className ?? ""}`}
        style={{ width, height }}
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={candidates[index]}
      alt={alt}
      title={title}
      width={width}
      height={height}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
