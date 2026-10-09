import { T } from '../theme';

// ── Search button ────────────────────────────────────────────────────────────
// Opens the command palette (also ⌘K / Ctrl+K / "/"). Same ghost spec as the
// other header buttons.

export function SearchButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const size = compact ? 30 : 34;
  return (
    <button
      onClick={onClick}
      title="Find a tool (⌘K)"
      aria-label="Find a tool"
      className="gc-icon-btn"
      style={{
        width: size, height: size, borderRadius: 0, border: `1px solid ${T.border}`,
        background: 'transparent', color: T.textDim, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width={compact ? 13 : 14} height={compact ? 13 : 14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="7" cy="7" r="5" /><path d="M11 11l4 4" />
      </svg>
    </button>
  );
}
