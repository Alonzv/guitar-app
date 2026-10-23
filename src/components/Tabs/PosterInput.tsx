import { useEffect, useRef, useState } from 'react';
import { T } from '../../theme';

// ── An editable poster title ────────────────────────────────────────────────
// The song or tab title set in the Archivo poster face, sized down until the
// text (or the placeholder) fits the column — never cut. A hidden twin span
// is measured at the largest size and the input takes the fitted size.

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max?: number;
  min?: number;
  label: string;
}

export function PosterInput({ value, onChange, placeholder, max = 120, min = 32, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const twin = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  const text = value || placeholder;

  useEffect(() => {
    const b = box.current, t = twin.current;
    if (!b || !t) return;
    const fit = () => {
      const w = t.getBoundingClientRect().width;     // measured at `max`
      const avail = b.clientWidth - 4;
      setSize(w > avail && w > 0 ? Math.max(min, Math.floor(max * avail / w)) : max);
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit); ro.observe(b);
    return () => ro.disconnect();
  }, [text, max, min]);

  return (
    <div ref={box} style={{ position: 'relative', minWidth: 0 }}>
      {/* A zero-size box keeps the measuring twin from widening the page. */}
      <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <span ref={twin} className="su-poster" style={{
          display: 'inline-block', visibility: 'hidden', whiteSpace: 'pre', fontSize: max, pointerEvents: 'none',
        }}>{text}</span>
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        dir="auto"
        className="su-poster"
        style={{
          display: 'block', width: '100%', fontSize: size, height: Math.round(size * 0.86) + 6, padding: 0,
          border: 'none', outline: 'none', background: 'transparent', color: T.text,
        }}
      />
    </div>
  );
}
