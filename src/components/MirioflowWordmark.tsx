// Tiger paths in a 64x64 box, shared with design/mirioflow-icons/generate.py.
const HEAD =
  "M14 7L25 15Q32 12.5 39 15L50 7L51 21L58 27L53 31L59 38L52 41L54 48L43 51L32 58L21 51L10 48L12 41L5 38L11 31L6 27L13 21Z";
const CUTS =
  "M16.5 11L23 15.5L17.5 18Z M47.5 11L41 15.5L46.5 18Z M29.5 15L34.5 15L32 23Z M21 19.5L27.5 21L22.5 24.5Z M43 19.5L36.5 21L41.5 24.5Z M18 28.5L28 31.5L20 33Z M46 28.5L36 31.5L44 33Z M8.5 32.5L17 34.5L10 36Z M55.5 32.5L47 34.5L54 36Z M11 42.5L18 41.5L13 44.5Z M53 42.5L46 41.5L51 44.5Z M28.5 35.5L35.5 35.5L32 39Z M22.5 41.5Q32 37.5 41.5 41.5L38.5 51Q32 54.5 25.5 51Z";
const FANGS =
  "M25 41.6L28.6 40.5L26.6 47Z M39 41.6L35.4 40.5L37.4 47Z M28.5 52.3L30.5 52.9L29.2 49.5Z M35.5 52.3L33.5 52.9L34.8 49.5Z";

/** Mirioflow wordmark: a white roaring tiger face on orange, plus the name. */
export function MirioflowWordmark({ className }: { className?: string }) {
  return (
    <span className={className ?? "logo-wordmark"}>
      <svg
        className="logo-wordmark-mark"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="logo-wordmark-badge" width="64" height="64" rx="15" />
        <g transform="translate(5 5.5) scale(0.84)">
          <path className="logo-wordmark-tiger" d={HEAD} />
          <path className="logo-wordmark-badge" d={CUTS} />
          <path className="logo-wordmark-tiger" d={FANGS} />
        </g>
      </svg>
      <span className="logo-wordmark-text">Mirioflow</span>
    </span>
  );
}
