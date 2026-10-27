// Tiger paths in a 200x200 box, shared with design/mirioflow-icons/generate.py.
const TILT = "translate(100 104) rotate(-12) scale(0.86) translate(-100 -104)";
const HEAD =
  "M100 30 C120 28 130 32 136 36 Q144 16 160 18 Q170 24 162 46 Q174 54 178 66 Q170 68 166 70 Q182 80 186 98 Q176 96 170 98 Q186 112 182 130 Q172 126 166 128 Q174 144 160 158 Q150 152 144 152 Q136 166 120 174 Q100 184 80 174 Q64 166 56 152 Q50 152 40 158 Q26 144 34 128 Q28 126 18 130 Q14 112 30 98 Q24 96 14 98 Q18 80 34 70 Q30 68 22 66 Q26 54 38 46 Q30 24 40 18 Q56 16 64 36 C70 32 80 28 100 30 Z";
const INK_SHAPES =
  "M144 34 Q150 24 158 24 Q162 30 158 40 Z M56 34 Q50 24 42 24 Q38 30 42 40 Z M94 36 L106 36 L100 52 Z M84 40 L90 38 L88 50 Z M116 40 L110 38 L112 50 Z M70 44 L80 46 L72 56 Z M130 44 L120 46 L128 56 Z M148 60 L170 66 L150 70 Z M152 82 L178 92 L154 92 Z M150 104 L178 114 L152 114 Z M146 124 L168 134 L148 134 Z M52 60 L30 66 L50 70 Z M48 82 L22 92 L46 92 Z M50 104 L22 114 L48 114 Z M54 124 L32 134 L52 134 Z M90 70 L98 72 L92 74 Z M110 70 L102 72 L108 74 Z M62 68 L86 76 L70 80 Z M138 68 L114 76 L130 80 Z M86 84 Q100 80 114 84 L104 96 Q100 99 96 96 Z M60 108 Q80 100 96 104 Q100 106 104 104 Q120 100 140 108 Q148 132 132 150 Q100 166 68 150 Q52 132 60 108 Z";
const TONGUE = "M70 149 Q100 126 130 149 Q100 168 70 149 Z";
const FANGS =
  "M66 108 L78 106 L72 132 Z M134 108 L122 106 L128 132 Z M84 104 L90 104.5 L87 112 Z M116 104 L110 104.5 L113 112 Z M80 155 L88 157.5 L86 138 Z M120 155 L112 157.5 L114 138 Z";

/** Mirioflow wordmark: a white tiger roaring on orange, plus the name. */
export function MirioflowWordmark({ className }: { className?: string }) {
  return (
    <span className={className ?? "logo-wordmark"}>
      <svg
        className="logo-wordmark-mark"
        viewBox="0 0 200 200"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          className="logo-wordmark-badge"
          width="200"
          height="200"
          rx="46"
        />
        <g transform={TILT}>
          <path className="logo-wordmark-tiger" d={HEAD} />
          <path className="logo-wordmark-ink" d={INK_SHAPES} />
          <circle className="logo-wordmark-eye" cx="74" cy="75" r="2.6" />
          <circle className="logo-wordmark-eye" cx="126" cy="75" r="2.6" />
          <path className="logo-wordmark-tongue" d={TONGUE} />
          <path className="logo-wordmark-tiger" d={FANGS} />
        </g>
      </svg>
      <span className="logo-wordmark-text">Mirioflow</span>
    </span>
  );
}
