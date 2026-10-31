import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { stopById, searchStops, type Stop } from '../../data/tools';
import { StopList } from './StopList';
import { GlassDefs } from './GlassDefs';
import { HomeHero } from './HomeHero';
import { StopSearch } from './StopSearch';
import { setActionsSlot } from './actionsSlot';
import { Wordmark } from '../Wordmark';
import { HelpButton } from '../HelpButton';
import { SoundToggle } from '../SoundToggle';
import { LangToggle } from '../LangToggle';

// ── Shell (Liquid Glass) ─────────────────────────────────────────────────────
// Glass is the navigation layer only; the tools underneath stay flat.
// Mobile: Home is one "Continue" card, three ways to start, then every tool
// in grouped lists. A tool opens full screen under a floating glass back
// button, with a large title and the song bar floating in glass at the
// bottom. Desktop: a floating glass sidebar with search and the grouped
// tools; the tool fills the rest.

interface Props {
  desktop: boolean;
  /** Current stop id, or 'home' (mobile only). */
  stop: string;
  sub?: string;
  onGo: (stopId: string, sub?: string) => void;
  onSub: (sub: string) => void;
  onHome: () => void;
  /** The last stop used — marked on the mobile map. */
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



function SubPills({ stop, sub, onSub }: { stop: Stop; sub?: string; onSub: (s: string) => void }) {
  const { lang } = useLang();
  // A glass bubble slides under the chosen tab and stretches as it travels.
  const barRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const lastX = useRef<number | null>(null);
  useLayoutEffect(() => {
    const on = barRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!on) { setThumb(null); return; }
    const next = { x: on.offsetLeft, w: on.offsetWidth };
    if (lastX.current != null && lastX.current !== next.x) {
      setMoving(true);
      const t = setTimeout(() => setMoving(false), 260);
      lastX.current = next.x; setThumb(next);
      return () => clearTimeout(t);
    }
    lastX.current = next.x; setThumb(next);
  }, [sub, lang]);
  if (!stop.subs) return null;
  return (
    <div role="tablist" className="su-seg" ref={barRef}>
      {thumb && <span aria-hidden className="su-seg-thumb" data-moving={moving || undefined}
        style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {stop.subs.map(s => (
        <button key={s.id} role="tab" aria-selected={s.id === sub} data-active={s.id === sub} onClick={() => onSub(s.id)} className="gc-no-bar">
          {s.label[lang]}
        </button>
      ))}
    </div>
  );
}

/** Back: a plain chevron, drawn as a vector (not a ‹ character) so it sits
 *  dead-centre and keeps the line weight of the other marks. It points the
 *  way back — left, or right when the page reads right-to-left. */
function BackChevron({ rtl }: { rtl: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" style={rtl ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M12.5 4 L6.5 10 L12.5 16" />
    </svg>
  );
}

const helpTopic = (stop: Stop, sub?: string) => stop.subs?.find(s => s.id === sub)?.help ?? stop.help;

/** The stop's name as a large title. */
function StopTitle({ text }: { text: string }) {
  return <h1 className="su-title gc-notation">{text}</h1>;
}

// ── Mobile ───────────────────────────────────────────────────────────────────

function MobileTransit({ stop: stopId, sub, onGo, onSub, onHome, lastStop, userMenu, sharedBanner, dock, ownPoster, children }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const [q, setQ] = useState('');
  const results = searchStops(q);
  const stop = stopById(stopId);

  const home = stopId === 'home' || !stop;

  if (home) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ minHeight: '100dvh', background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)', isolation: 'isolate' }}>
        <GlassDefs />
        <div className="su-ambient su-ambient-quiet" aria-hidden />
        {sharedBanner}
        <div style={{ maxWidth: 560, margin: '0 auto', padding: 'calc(12px + env(safe-area-inset-top)) 16px calc(48px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
            <Wordmark size={34} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SoundToggle compact /><LangToggle compact />{userMenu}
            </div>
          </div>

          <HomeHero lastStop={lastStop} onGo={onGo} />

          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="su-h2">{he ? 'כל הכלים' : 'All tools'}</h2>
            <StopSearch value={q} onChange={setQ} onSubmit={() => { if (results[0]) onGo(results[0].id); }} />
            <div style={{ marginTop: 14 }}>
              <StopList stops={results} current={lastStop} onGo={onGo} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  const topic = helpTopic(stop, sub);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ minHeight: '100dvh', background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)', display: 'flex', flexDirection: 'column', isolation: 'isolate' }}>
      <GlassDefs />
      <div className="su-ambient su-ambient-quiet" aria-hidden />
      {sharedBanner}
      {/* Floating glass controls; no bar behind them, the content scrolls under. */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40, pointerEvents: 'none',
        padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <button onClick={onHome} className="lg lg-circle gc-no-bar" aria-label={he ? 'חזרה לבית' : 'Back to Home'}
          style={{ pointerEvents: 'auto', color: T.text }}>
          <BackChevron rtl={rtl} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none', pointerEvents: 'auto' }}>
          <div ref={setActionsSlot} style={{ display: 'flex', alignItems: 'center', gap: 8 }} />
          {topic && <HelpButton topic={topic} />}
        </div>
      </header>
      <main style={{ flex: 1, padding: '4px 16px 32px', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {!ownPoster && <StopTitle text={stop.name[lang]} />}
        <SubPills stop={stop} sub={sub} onSub={onSub} />
        {children}
      </main>
      {dock && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 40, padding: '0 10px calc(10px + env(safe-area-inset-bottom))' }}>
          <div className="lg lg-bar" style={{ borderRadius: 28, overflow: 'hidden' }}>{dock}</div>
        </div>
      )}
    </div>
  );
}

// ── Desktop ──────────────────────────────────────────────────────────────────

function DesktopTransit({ stop: stopId, sub, onGo, onSub, userMenu, sharedBanner, dock, ownPoster, children }: Props) {
  const { lang, rtl } = useLang();
  const [q, setQ] = useState('');
  const results = searchStops(q);
  const searchRef = useRef<HTMLInputElement>(null);
  const stop = stopById(stopId) ?? stopById('chord-builder')!;
  const topic = helpTopic(stop, sub);
  const isElectron = typeof navigator !== 'undefined' && /Electron|Tauri/.test(navigator.userAgent);

  // ⌘K / Ctrl+K (or "/") focuses the search from anywhere.
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
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ height: '100vh', position: 'relative', background: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)', overflow: 'hidden', isolation: 'isolate' }}>
      <GlassDefs />
      <div className="su-ambient" aria-hidden />

      {/* The floating glass sidebar */}
      <aside className="lg lg-bar" style={{
        position: 'absolute', insetInlineStart: 10, top: 10, bottom: 10, width: 260, zIndex: 30,
        borderRadius: 26, display: 'flex', flexDirection: 'column', minHeight: 0,
        padding: `${isElectron ? 46 : 18}px 12px 12px`,
      }}>
        <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 40, WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <button onClick={() => onGo('learn-scale')} className="gc-no-bar" aria-label="ScaleUp"
          style={{ padding: '4px 12px 14px', textAlign: 'start', color: T.text, alignSelf: 'stretch' }}>
          <Wordmark size={26} />
        </button>
        <div style={{ margin: '0 4px 16px' }}>
          <StopSearch ref={searchRef} value={q} onChange={setQ} shortcut
            onSubmit={() => { if (results[0]) { onGo(results[0].id); setQ(''); } }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px', scrollbarWidth: 'none' }}>
          <StopList stops={results} current={stop.id} onGo={id => { onGo(id); setQ(''); }} dense />
        </div>
        <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{userMenu}</div>
          <SoundToggle compact /><LangToggle compact />
        </div>
      </aside>

      {/* The tool */}
      <main style={{ position: 'absolute', inset: 0, paddingInlineStart: 280, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 64, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '0 28px', WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div ref={setActionsSlot} style={{ display: 'flex', alignItems: 'center', gap: 8 }} />
            {topic && <HelpButton topic={topic} />}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {sharedBanner}
          <div style={{ padding: '4px 40px 48px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1080, margin: '0 auto' }}>
            {!ownPoster && <StopTitle text={stop.name[lang]} />}
            <SubPills stop={stop} sub={sub} onSub={onSub} />
            {children}
          </div>
        </div>
        {dock && (
          <div style={{ flex: 'none', padding: '0 20px 14px' }}>
            <div className="lg lg-bar" style={{ borderRadius: 26, overflow: 'hidden' }}>{dock}</div>
          </div>
        )}
      </main>
    </div>
  );
}
