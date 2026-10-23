import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { stopById, lineOf, searchStops, type Stop } from '../../data/tools';
import { NetworkMap } from './NetworkMap';
import { StopSearch } from './StopSearch';
import { setActionsSlot } from './actionsSlot';
import { Wordmark } from '../Wordmark';
import { slideIn } from '../../utils/motion';
import { HelpButton } from '../HelpButton';
import { SoundToggle } from '../SoundToggle';
import { LangToggle } from '../LangToggle';

// ── Transit shell ────────────────────────────────────────────────────────────
// Mobile: the network map is home; a stop opens full screen under a
// "[L#] ← STOP" header, with a floating "Next stop" pill on the map that
// resumes the last tool. Desktop: the map is a permanent 300px left rail and
// the stop fills the rest under a 64px top bar with the breadcrumb.

interface Props {
  desktop: boolean;
  /** Current stop id, or 'home' (mobile only). */
  stop: string;
  sub?: string;
  onGo: (stopId: string) => void;
  onSub: (sub: string) => void;
  onHome: () => void;
  /** The last stop used — the Next-stop pill on the mobile map. */
  lastStop: string;
  darkMode: boolean;
  onToggleDark: () => void;
  userMenu: ReactNode;
  sharedBanner?: ReactNode;
  /** The song bar under the stop. */
  dock?: ReactNode;
  /** Stops that draw their own poster title (the rest get the stop name). */
  ownPoster?: boolean;
  children: ReactNode;
}

export function TransitShell(p: Props) {
  return p.desktop ? <DesktopTransit {...p} /> : <MobileTransit {...p} />;
}

// ── Small parts ──────────────────────────────────────────────────────────────

function LineBadge({ stop, size = 'sm' }: { stop: Stop; size?: 'sm' | 'md' }) {
  const line = lineOf(stop);
  return (
    <span style={{
      background: line.color, color: line.onColor, padding: size === 'md' ? '3px 7px' : '3px 6px',
      fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', flex: 'none',
    }}>{line.id}</span>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const { lang } = useLang();
  return (
    <button onClick={onToggle} aria-pressed={dark} className="gc-no-bar"
      aria-label={lang === 'he' ? (dark ? 'מצב בהיר' : 'מצב לילה') : (dark ? 'Light mode' : 'Night mode')}
      style={{
        width: 40, height: 40, padding: 0, flex: 'none', borderRadius: '50%', cursor: 'pointer', fontWeight: 700, fontSize: 14,
        border: `1.5px solid ${T.text}`, background: dark ? T.secondary : 'transparent', color: dark ? T.white : T.text,
      }}>{dark ? '☀' : '☾'}</button>
  );
}

function SubPills({ stop, sub, onSub }: { stop: Stop; sub?: string; onSub: (s: string) => void }) {
  const { lang } = useLang();
  if (!stop.subs) return null;
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {stop.subs.map(s => {
        const on = s.id === sub;
        return (
          <button key={s.id} role="tab" aria-selected={on} data-active={on} onClick={() => onSub(s.id)}
            className="gc-no-bar"
            style={{
              height: 40, padding: '0 16px', borderRadius: 'var(--su-pill)', cursor: 'pointer',
              border: `1.5px solid ${T.text}`, background: on ? T.secondary : 'transparent', color: on ? T.white : T.text,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
            }}>{s.label[lang]}</button>
        );
      })}
    </div>
  );
}

/** Back: a plain chevron, drawn as a vector (not a ‹ character) so it sits
 *  dead-centre and keeps the line weight of the other marks. It points the
 *  way back — left, or right when the page reads right-to-left. */
function BackChevron({ rtl }: { rtl: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="square" strokeLinejoin="miter" style={rtl ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M12.5 4 L6.5 10 L12.5 16" />
    </svg>
  );
}

const helpTopic = (stop: Stop, sub?: string) => stop.subs?.find(s => s.id === sub)?.help ?? stop.help;

/** The stop's name as a poster, sized down until it fits its width. */
function StopPoster({ text, max }: { text: string; max: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useEffect(() => {
    const el = ref.current; const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.fontSize = `${max}px`;
      const w = el.getBoundingClientRect().width, avail = box.clientWidth;
      setSize(w > avail && w > 0 ? Math.max(28, Math.floor(max * avail / w)) : max);
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit); ro.observe(box);
    return () => ro.disconnect();
  }, [text, max]);
  return (
    <div style={{ overflowX: 'clip', whiteSpace: 'nowrap' }}>
      <span ref={ref} className="su-poster" style={{ display: 'inline-block', fontSize: size, paddingBottom: '0.12em' }}>{text}</span>
    </div>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────

function MobileTransit({ stop: stopId, sub, onGo, onSub, onHome, lastStop, darkMode, onToggleDark, userMenu, sharedBanner, dock, children }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const [q, setQ] = useState('');
  const results = searchStops(q);
  const stop = stopById(stopId);
  const last = stopById(lastStop);

  // Coming back to the map with a different last stop: its name slides in.
  const nextRef = useRef<HTMLSpanElement>(null);
  const shownNext = useRef(lastStop);
  const home = stopId === 'home' || !stop;
  useEffect(() => {
    if (!home || shownNext.current === lastStop) return;
    shownNext.current = lastStop;
    slideIn(nextRef.current);
  }, [home, lastStop]);

  if (home) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ minHeight: '100dvh', background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)' }}>
        {sharedBanner}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '12px 20px 0' }}>
          <SoundToggle compact /><LangToggle compact /><ThemeToggle dark={darkMode} onToggle={onToggleDark} />{userMenu}
        </div>
        <div style={{ padding: '14px 20px 16px' }}>
          <Wordmark size="min(72px, 19vw)" />
        </div>
        <div style={{ margin: '0 20px' }}>
          <StopSearch value={q} onChange={setQ} onSubmit={() => { if (results[0]) onGo(results[0].id); }} />
        </div>
        <div style={{ padding: '14px 20px 120px' }}>
          <NetworkMap stops={results} current={lastStop} onGo={onGo} />
        </div>

        {/* Next stop — the last tool used, one tap away. */}
        {last && (
          <div style={{
            position: 'fixed', insetInline: 14, bottom: 'calc(18px + env(safe-area-inset-bottom))', height: 66, zIndex: 50,
            borderRadius: 'var(--su-pill)', background: T.secondary, color: T.white,
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px 0 22px',
          }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gc-primary)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.16em', opacity: 0.7 }}>{he ? 'התחנה הבאה' : 'NEXT STOP'}</span>
              <span ref={nextRef} style={{ fontFamily: 'var(--su-display)', fontStretch: '75%', fontWeight: 700, fontSize: 18, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {last.name[lang]}
              </span>
            </div>
            <button onClick={() => onGo(last.id)} aria-label={he ? `אל ${last.name.he}` : `Go to ${last.name.en}`} className="gc-no-bar"
              style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: T.bgDeep, color: T.text, fontSize: 18, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>
              {rtl ? '←' : '→'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const topic = helpTopic(stop, sub);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ minHeight: '100dvh', background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)', display: 'flex', flexDirection: 'column' }}>
      {sharedBanner}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40, background: T.bgDeep,
        padding: 'calc(10px + env(safe-area-inset-top)) 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        borderBottom: `var(--su-rule) solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onHome} className="gc-no-bar" aria-label={he ? 'חזרה למפה' : 'Back to the map'} title={he ? 'למפה' : 'Map'}
            style={{
              width: 44, height: 44, flex: 'none', borderRadius: '50%', border: `1.5px solid ${T.text}`, background: 'transparent',
              color: T.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <BackChevron rtl={rtl} />
          </button>
          <button onClick={onHome} tabIndex={-1} aria-hidden className="gc-no-bar"
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text, fontSize: 11, letterSpacing: '0.1em', padding: 0 }}>
            <LineBadge stop={stop} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name[lang].toUpperCase()}</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <div ref={setActionsSlot} style={{ display: 'flex', alignItems: 'center', gap: 6 }} />
          {topic && <HelpButton topic={topic} />}
        </div>
      </header>
      <main style={{ flex: 1, padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <SubPills stop={stop} sub={sub} onSub={onSub} />
        {children}
      </main>
      {dock && <div style={{ position: 'sticky', bottom: 0, zIndex: 40 }}>{dock}</div>}
    </div>
  );
}

// ── Desktop ──────────────────────────────────────────────────────────────────

function DesktopTransit({ stop: stopId, sub, onGo, onSub, darkMode, onToggleDark, userMenu, sharedBanner, dock, ownPoster, children }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const [q, setQ] = useState('');
  const results = searchStops(q);
  const searchRef = useRef<HTMLInputElement>(null);
  const stop = stopById(stopId) ?? stopById('chord-builder')!;
  const line = lineOf(stop);
  const topic = helpTopic(stop, sub);

  // ⌘K / Ctrl+K (or "/") focuses the map's search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{
      height: '100vh', display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gridTemplateRows: 'auto 1fr',
      background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)',
    }}>
      <div style={{ gridColumn: '1 / -1' }}>{sharedBanner}</div>

      {/* The map rail */}
      <aside style={{ borderInlineEnd: `var(--su-rule) solid ${T.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <button onClick={() => onGo('chord-builder')} className="gc-no-bar" aria-label="ScaleUp"
          style={{ padding: '26px 24px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: rtl ? 'right' : 'left', color: T.text }}>
          <Wordmark size={64} />
        </button>
        <div style={{ margin: '0 20px 14px' }}>
          <StopSearch ref={searchRef} value={q} onChange={setQ} shortcut
            onSubmit={() => { if (results[0]) { onGo(results[0].id); setQ(''); } }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 8px', scrollbarWidth: 'thin' }}>
          <NetworkMap stops={results} current={stop.id} onGo={id => { onGo(id); setQ(''); }} dense />
        </div>
        <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{userMenu}</div>
          <SoundToggle compact /><LangToggle compact /><ThemeToggle dark={darkMode} onToggle={onToggleDark} />
        </div>
      </aside>

      {/* The stop */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div style={{
          height: 64, flex: 'none', borderBottom: `var(--su-rule) solid ${T.border}`, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, padding: '0 32px', fontSize: 11, letterSpacing: '0.1em',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <LineBadge stop={stop} size="md" />
            <span>{line.name[lang].toUpperCase()}</span>
            <span style={{ color: T.textMuted }}>/</span>
            <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name[lang].toUpperCase()}</b>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
            <div ref={setActionsSlot} style={{ display: 'flex', alignItems: 'center', gap: 8 }} />
            {topic && <HelpButton topic={topic} />}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ padding: '28px 32px 40px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1240 }}>
            {!ownPoster && <StopPoster text={stop.name[lang]} max={he ? 110 : 132} />}
            <SubPills stop={stop} sub={sub} onSub={onSub} />
            {children}
          </div>
        </div>
        {dock && <div style={{ flex: 'none' }}>{dock}</div>}
      </main>
    </div>
  );
}
